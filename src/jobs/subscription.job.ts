/**
 * subscription.worker.ts
 *
 * Processes subscription lifecycle events: reminders, expiry notifications,
 * and grace-period cancellations.
 *
 * Design principles applied:
 *  - Atomic NX locks prevent duplicate processing across worker instances.
 *  - DB-level unique constraint on (subscriptionId, billingCycleKey) prevents
 *    duplicate renewal transactions even under concurrent workers.
 *  - Batch Prisma includes eliminate N+1 queries.
 *  - Each phase (reminder / expiry / cancellation) queries its own correct window.
 *  - Controlled concurrency via p-limit instead of sequential awaits.
 *  - Grace-period state (PAST_DUE) replaces immediate hard cancellation.
 *  - All timings and domain config are centralised in RENEWAL_CONFIG.
 *  - Per-subscription errors are caught and logged; one bad record never
 *    aborts the entire batch.
 *  - Reconciliation helpers surface subscriptions whose state is inconsistent
 *    so a follow-up job or alert can intervene.
 */

import crypto from "crypto";
import { Worker } from "bullmq";
import { Container } from "typedi";
import pLimit from "p-limit";
import logger from "@/utils/logger";
import db from "@/config/db-config";
import { EmailQueue } from "@/services/schedule.email.service";
import { WalletService } from "@/services/wallet.service";
import { CreatePaymentDto } from "@/dto/payment.dto";
import { PaymentService } from "@/services/payment.service";
import { PaymentMethod, SubscriptionStatus } from "@/generated/prisma/client";
import { PaymentRepository } from "@/repositories/payment.repository";
import { redisConnection, redisClient } from "@/config/redis-config";
import { jobs, SUBSCRIPTION_WORKER } from "@/queues/subscription.queue";
import { jobs as transactionJobs, transactionQueue } from "@/queues/transaction.queue";
import { WebhookQueue } from "@/services/schedule.webhook.service";


// ---------------------------------------------------------------------------
// Configuration – move these to environment variables / feature flags as needed
// ---------------------------------------------------------------------------
const webhookQueueSvc = Container.get(WebhookQueue);
const RENEWAL_CONFIG = {
    /** How many days before expiry the customer receives their first reminder. */
    reminderDaysAhead: 3,
    /** How many days after expiry before a non-renewed subscription is cancelled. */
    gracePeriodDays: 2,
    /** How many hours the customer gets to complete payment after a trial ends. */
    trialGracePeriodHours: 24,
    /** Redis TTL (seconds) for idempotency keys – 10 days. */
    lockTtlSeconds: 10 * 24 * 60 * 60,
    /** Redis TTL (seconds) for the renewal-transaction cache entry – 5 days. */
    renewalTxCacheTtlSeconds: 5 * 24 * 60 * 60,
    /** Maximum parallel subscription processing within a single job run. */
    concurrencyLimit: 10,
    /** Base URL for the customer checkout page. */
    checkoutBaseUrl: process.env.CHECKOUT_BASE_URL ?? process.env.ORAFI_CHECHOUT_URL ?? "https://checkout.orafi.app",
} as const;

const DAY_MS = 1_000 * 60 * 60 * 24;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
    const end = startOfUtcDay(date);
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(-1);
    return end;
}

function addUtcDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}

/** YYYY-MM-DD string used in idempotency keys. */
function dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/**
 * A stable billing-cycle identifier derived from the subscription ID and
 * the day the current billing period ends.  Used as a unique key in the DB
 * to prevent duplicate renewal transactions even if two workers race.
 */
function billingCycleKey(subscriptionId: string, endsAt: Date): string {
    return `${subscriptionId}:${dayKey(endsAt)}`;
}

// ---------------------------------------------------------------------------
// Redis distributed lock
// ---------------------------------------------------------------------------

/**
 * Atomically acquires a lock using SET NX EX.
 *
 * The previous implementation omitted the NX flag, meaning a second worker
 * could silently overwrite the lock and both would believe they held it.
 * SET NX EX is a single atomic command – no race window exists.
 */
async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await redisClient.set(key, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
}

// ---------------------------------------------------------------------------
// Metrics / observability stub
// ---------------------------------------------------------------------------
interface BatchStats {
    phase: "reminder" | "trial" | "expiry" | "cancellation" | "reconciliation";
    attempted: number;
    skipped: number;   // lock already held
    succeeded: number;
    failed: number;
}

interface ReconciliationStats extends BatchStats {
    phase: "reconciliation";
    activeRepaired: number;
    pastDueRepaired: number;
}

function logStats(stats: BatchStats | ReconciliationStats): void {
    const reconciliationMetrics = "activeRepaired" in stats
        ? ` activeRepaired=${stats.activeRepaired} pastDueRepaired=${stats.pastDueRepaired}`
        : "";

    logger.info(
        `[subscription-worker] phase=${stats.phase} ` +
        `attempted=${stats.attempted} skipped=${stats.skipped} ` +
        `succeeded=${stats.succeeded} failed=${stats.failed}` +
        reconciliationMetrics
    );
}

// ---------------------------------------------------------------------------
// Renewal-transaction helpers
// ---------------------------------------------------------------------------

/**
 * Finds an existing renewal transaction for this billing cycle or creates
 * a new one.  The billingCycleKey unique constraint in the DB makes this
 * safe even when two workers run concurrently – the second INSERT will fail
 * and fall back to a SELECT.
 *
 * NOTE: Your PaymentRepository.createPayment must propagate a unique-
 * constraint error (e.g. Prisma P2002) rather than swallowing it for this
 * guarantee to hold.  Add a unique index in your Prisma schema:
 *
 *   @@unique([billingCycleKey])   on the Payment model
 */
async function findOrCreateRenewalTransaction(
    paymentRepository: PaymentRepository,
    walletService: WalletService,
    context: SubscriptionWithRelations,
): Promise<{ id: string }> {
    const cycleKey = billingCycleKey(context.id, context.endsAt!);

    // 1. Try to find an existing renewal transaction for this cycle.
    const existing = await paymentRepository.findSubscriptionPaymentByBillingCycleKey(cycleKey);
    if (existing) return existing;

    // 2. None found – convert amount and create.
    const amountInUsdt = await walletService.convertBetweenCurrencyAndUSDT(
        context.plan.amount,
        context.plan.currency,
        "to_USDT"
    );

    try {
        const tx = await paymentRepository.createPayment(
            context.plan.amount,
            amountInUsdt,
            context.plan.currency,
            context.network,
            context.customer,
            "",
            context.plan.profile.id,
            context.mode,
            {
                paymentMethod: PaymentMethod.SUBSCRIPTION,
                subscriptionId: context.id,
                billingCycleKey: cycleKey,  // stored for uniqueness guarantee
            }
        );

        // Cache the metadata needed at the checkout page so it survives restarts.
        await redisClient.set(
            tx.id,
            JSON.stringify({
                amount: context.plan.amount,
                amountInUSDC: amountInUsdt,
                businessName: context.plan.profile.businessName,
                redirectUrl: "",
                mode: context.mode,
                currency: context.plan.currency,
                network: context.network,
            }),
            "EX",
            RENEWAL_CONFIG.renewalTxCacheTtlSeconds
        );

        try {
            await webhookQueueSvc.addScheduler(context.plan.profile.id, {
                event: "payment.create",
                data: {
                    transactionId: tx.id,
                    amount: context.plan.amount,
                    currency: context.plan.currency,
                    status: "created",
                    occuredAt: new Date().toISOString(),
                },
            });
        } catch (webhookErr) {
            // Webhook failure must never block the renewal workflow.
            logger.warn(`[subscription-worker] webhook failed for tx ${tx.id}: ${webhookErr}`);
        }

        return tx;
    } catch (err: any) {
        // P2002 = Prisma unique constraint violation – another worker beat us.
        if (err?.code === "P2002") {
            const race = await paymentRepository.findSubscriptionPaymentByBillingCycleKey(cycleKey);
            if (race) return race;
        }
        throw err;
    }
}

async function findOrCreateTrialTransaction(
    paymentRepository: PaymentRepository,
    paymentService: PaymentService,
    context: SubscriptionWithRelations,
): Promise<{ paymentId: string; checkoutUrl: string }> {
    const existing = await paymentRepository.findSubscriptionPaymentBySubscriptionId(context.id);
    if (existing) {
        return {
            paymentId: existing.id,
            checkoutUrl: `${RENEWAL_CONFIG.checkoutBaseUrl}/${existing.id}`,
        };
    }

    const paymentData: CreatePaymentDto = {
        amount: context.plan.amount,
        customerId: context.customerId,
        currency: context.plan.currency,
        network: context.network,
        txRef: `${crypto.randomBytes(4).toString("hex").slice(0, 7)}-${context.id}`,
        type: PaymentMethod.SUBSCRIPTION,
        subscriptionId: context.id,
    };

    const paymentResult = await paymentService.createPayment(paymentData, context.plan.profile.userId, context.mode);

    return {
        paymentId: paymentResult.payload.transaction.id,
        checkoutUrl: paymentResult.payload.checkoutUrl ?? `${RENEWAL_CONFIG.checkoutBaseUrl}/${paymentResult.payload.transaction.id}`,
    };
}

// ---------------------------------------------------------------------------
// Type alias for the hydrated subscription shape used throughout
// ---------------------------------------------------------------------------
type SubscriptionWithRelations = Awaited<
    ReturnType<typeof db.subscription.findMany<{
        include: {
            customer: true;
            plan: { include: { profile: true } };
        };
    }>>
>[number];

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

async function processReminders(
    paymentRepository: PaymentRepository,
    walletService: WalletService,
    emailQueue: EmailQueue,
    now: Date,
): Promise<BatchStats> {
    const stats: BatchStats = { phase: "reminder", attempted: 0, skipped: 0, succeeded: 0, failed: 0 };
    const target = addUtcDays(now, RENEWAL_CONFIG.reminderDaysAhead);
    const window = { gte: startOfUtcDay(target), lte: endOfUtcDay(target) };

    // Single query with includes – eliminates all N+1 lookups.
    const subscriptions = await db.subscription.findMany({
        where: { status: SubscriptionStatus.ACTIVE, endsAt: window },
        include: { customer: true, plan: { include: { profile: true } } },
    });

    const limit = pLimit(RENEWAL_CONFIG.concurrencyLimit);

    await Promise.all(
        subscriptions.map((sub: SubscriptionWithRelations) =>
            limit(async () => {
                stats.attempted++;
                const dedupeKey = `subscription:reminder:${sub.id}:${dayKey(sub.endsAt ?? now)}`;

                const locked = await acquireLock(dedupeKey, RENEWAL_CONFIG.lockTtlSeconds);
                if (!locked) { stats.skipped++; return; }

                try {
                    const renewalTx = await findOrCreateRenewalTransaction(paymentRepository, walletService, sub);

                    await emailQueue.addSubscriptionReminderScheduler({
                        email: sub.customer.email,
                        customerName: `${sub.customer.firstname} ${sub.customer.lastname}`,
                        merchantName: sub.plan.profile.businessName,
                        planName: sub.plan.name,
                        duration: String(sub.plan.duration),
                        amount: sub.plan.amount,
                        currency: sub.plan.currency,
                        daysLeft: RENEWAL_CONFIG.reminderDaysAhead,
                        checkoutUrl: `${RENEWAL_CONFIG.checkoutBaseUrl}/${renewalTx.id}`,
                        expiresAt: sub.endsAt?.toISOString() ?? "",
                    });

                    stats.succeeded++;
                } catch (err) {
                    stats.failed++;
                    logger.error(`[subscription-worker] reminder failed for ${sub.id}: ${err}`);
                }
            })
        )
    );

    return stats;
}

async function processTrialExpirations(
    paymentRepository: PaymentRepository,
    paymentService: PaymentService,
    emailQueue: EmailQueue,
    now: Date,
): Promise<BatchStats> {
    const stats: BatchStats = { phase: "trial", attempted: 0, skipped: 0, succeeded: 0, failed: 0 };

    const subscriptions = await db.subscription.findMany({
        where: { status: SubscriptionStatus.TRIALING, trialEndsAt: { lte: now } },
        include: { customer: true, plan: { include: { profile: true } } },
    });

    const limit = pLimit(RENEWAL_CONFIG.concurrencyLimit);

    await Promise.all(
        subscriptions.map((sub: SubscriptionWithRelations) =>
            limit(async () => {
                stats.attempted++;
                const dedupeKey = `subscription:trial:${sub.id}:${dayKey(sub.trialEndsAt ?? now)}`;

                const locked = await acquireLock(dedupeKey, RENEWAL_CONFIG.lockTtlSeconds);
                if (!locked) { stats.skipped++; return; }

                try {
                    const checkout = await findOrCreateTrialTransaction(paymentRepository, paymentService, sub);

                    await db.subscription.update({
                        where: { id: sub.id },
                        data: { status: SubscriptionStatus.PENDING },
                    });

                    await transactionQueue.add(
                        transactionJobs.VERIFY_INITIAL_SUBSCRIPTION_PAYMENT,
                        {
                            paymentId: checkout.paymentId,
                            subscriptionId: sub.id,
                            failureEmailTemplate: "cancelled",
                        },
                        {
                            delay: RENEWAL_CONFIG.trialGracePeriodHours * 60 * 60 * 1000,
                            removeOnComplete: true,
                            removeOnFail: false,
                            jobId: `verify-initial-subscription-payment:${sub.id}`,
                        }
                    );

                    await emailQueue.addSubscriptionTrialEndedScheduler({
                        email: sub.customer.email,
                        customerName: `${sub.customer.firstname} ${sub.customer.lastname}`,
                        merchantName: sub.plan.profile.businessName,
                        planName: sub.plan.name,
                        duration: String(sub.plan.duration),
                        trialDays: Number(sub.plan.trialDays ?? 0),
                        graceHours: RENEWAL_CONFIG.trialGracePeriodHours,
                        trialEndedAt: sub.trialEndsAt?.toISOString() ?? now.toISOString(),
                        checkoutUrl: checkout.checkoutUrl,
                    });

                    stats.succeeded++;
                } catch (err) {
                    stats.failed++;
                    logger.error(`[subscription-worker] trial expiration failed for ${sub.id}: ${err}`);
                }
            })
        )
    );

    return stats;
}

async function processExpiries(
    paymentRepository: PaymentRepository,
    walletService: WalletService,
    emailQueue: EmailQueue,
    now: Date,
): Promise<BatchStats> {
    const stats: BatchStats = { phase: "expiry", attempted: 0, skipped: 0, succeeded: 0, failed: 0 };

    // BUG FIX: use expiryWindow (today), NOT reminderWindow (3 days out).
    const expiryWindow = { gte: startOfUtcDay(now), lte: endOfUtcDay(now) };

    const subscriptions = await db.subscription.findMany({
        where: { status: SubscriptionStatus.ACTIVE, endsAt: expiryWindow },
        include: { customer: true, plan: { include: { profile: true } } },
    });

    const limit = pLimit(RENEWAL_CONFIG.concurrencyLimit);

    await Promise.all(
        subscriptions.map((sub: SubscriptionWithRelations) =>
            limit(async () => {
                stats.attempted++;
                const dedupeKey = `subscription:expiry:${sub.id}:${dayKey(sub.endsAt ?? now)}`;

                const locked = await acquireLock(dedupeKey, RENEWAL_CONFIG.lockTtlSeconds);
                if (!locked) { stats.skipped++; return; }

                try {
                    // Reuse the transaction created by the reminder phase if present.
                    const renewalTx = await findOrCreateRenewalTransaction(paymentRepository, walletService, sub);

                    // Transition to PAST_DUE grace period instead of immediate cancellation.
                    await db.subscription.update({
                        where: { id: sub.id },
                        data: { status: SubscriptionStatus.PAST_DUE },
                    });

                    await emailQueue.addSubscriptionExpiredScheduler({
                        email: sub.customer.email,
                        customerName: `${sub.customer.firstname} ${sub.customer.lastname}`,
                        merchantName: sub.plan.profile.businessName,
                        planName: sub.plan.name,
                        duration: String(sub.plan.duration),
                        checkoutUrl: `${RENEWAL_CONFIG.checkoutBaseUrl}/${renewalTx.id}`,
                        expiresAt: sub.endsAt?.toISOString() ?? "",
                    });

                    stats.succeeded++;
                } catch (err) {
                    stats.failed++;
                    logger.error(`[subscription-worker] expiry failed for ${sub.id}: ${err}`);
                }
            })
        )
    );

    return stats;
}

async function processCancellations(
    emailQueue: EmailQueue,
    now: Date,
): Promise<BatchStats> {
    const stats: BatchStats = { phase: "cancellation", attempted: 0, skipped: 0, succeeded: 0, failed: 0 };

    // Target subscriptions still in PAST_DUE after the grace period has elapsed.
    // BUG FIX: use cancellationWindow against PAST_DUE status (not ACTIVE + reminderWindow).
    const graceCutoff = addUtcDays(now, -RENEWAL_CONFIG.gracePeriodDays);
    const cancellationWindow = { lte: endOfUtcDay(graceCutoff) };

    const subscriptions = await db.subscription.findMany({
        where: { status: SubscriptionStatus.PAST_DUE, endsAt: cancellationWindow },
        include: { customer: true, plan: { include: { profile: true } } },
    });

    const limit = pLimit(RENEWAL_CONFIG.concurrencyLimit);

    await Promise.all(
        subscriptions.map((sub: SubscriptionWithRelations) =>
            limit(async () => {
                stats.attempted++;
                const dedupeKey = `subscription:cancel:${sub.id}:${dayKey(sub.endsAt ?? now)}`;

                const locked = await acquireLock(dedupeKey, RENEWAL_CONFIG.lockTtlSeconds);
                if (!locked) { stats.skipped++; return; }

                try {
                    const cancelledAt = new Date();

                    await db.subscription.update({
                        where: { id: sub.id },
                        data: { status: "CANCELLED", canceledAt: cancelledAt },
                    });

                    try {
                        await webhookQueueSvc.addScheduler(sub.plan.profile.id, {
                            event: "subscription.disable",
                            data: {
                                transactionId: sub.id,
                                amount: sub.plan.amount,
                                currency: sub.plan.currency,
                                status: "disabled",
                                occuredAt: cancelledAt.toISOString(),
                            },
                        });
                    } catch (webhookErr) {
                        logger.warn(`[subscription-worker] webhook failed for cancel ${sub.id}: ${webhookErr}`);
                    }

                    await emailQueue.addSubscriptionCancelledScheduler({
                        email: sub.customer.email,
                        customerName: `${sub.customer.firstname} ${sub.customer.lastname}`,
                        merchantName: sub.plan.profile.businessName,
                        planName: sub.plan.name,
                        duration: String(sub.plan.duration),
                        cancelledAt: cancelledAt.toISOString(),
                        ...(sub.endsAt ? { expiresAt: sub.endsAt.toISOString() } : {}),
                    });

                    stats.succeeded++;
                } catch (err) {
                    stats.failed++;
                    logger.error(`[subscription-worker] cancellation failed for ${sub.id}: ${err}`);
                }
            })
        )
    );

    return stats;
}

// ---------------------------------------------------------------------------
// Reconciliation – surfaces stuck states for alerting / follow-up jobs
// ---------------------------------------------------------------------------
async function reconcileStuckSubscriptions(now: Date): Promise<ReconciliationStats> {
    // Subscriptions still ACTIVE but whose endsAt is in the past (worker may have been down).
    const stuckActive = await db.subscription.findMany({
        where: {
            status: SubscriptionStatus.ACTIVE,
            endsAt: { lte: endOfUtcDay(addUtcDays(now, -1)) },
        },
        select: { id: true },
    });

    // Subscriptions stuck in PAST_DUE beyond 2× the grace period.
    const stuckPastDue = await db.subscription.findMany({
        where: {
            status: SubscriptionStatus.PAST_DUE,
            endsAt: { lte: endOfUtcDay(addUtcDays(now, -(RENEWAL_CONFIG.gracePeriodDays * 2))) },
        },
        select: { id: true },
    });

    const limit = pLimit(RENEWAL_CONFIG.concurrencyLimit);
    const stats: ReconciliationStats = {
        phase: "reconciliation",
        attempted: stuckActive.length + stuckPastDue.length,
        skipped: 0,
        succeeded: 0,
        failed: 0,
        activeRepaired: 0,
        pastDueRepaired: 0,
    };

    await Promise.all([
        ...stuckActive.map((subscription) =>
            limit(async () => {
                try {
                    const result = await db.subscription.updateMany({
                        where: {
                            id: subscription.id,
                            status: SubscriptionStatus.ACTIVE,
                        },
                        data: { status: SubscriptionStatus.PAST_DUE },
                    });

                    if (result.count === 0) {
                        stats.skipped++;
                        return;
                    }

                    stats.succeeded++;
                    stats.activeRepaired++;
                } catch (err) {
                    stats.failed++;
                    logger.error(`[subscription-worker] reconciliation failed for ACTIVE ${subscription.id}: ${err}`);
                }
            })
        ),
        ...stuckPastDue.map((subscription) =>
            limit(async () => {
                try {
                    const result = await db.subscription.updateMany({
                        where: {
                            id: subscription.id,
                            status: SubscriptionStatus.PAST_DUE,
                        },
                        data: { status: "CANCELLED" as any, canceledAt: now },
                    });

                    if (result.count === 0) {
                        stats.skipped++;
                        return;
                    }

                    stats.succeeded++;
                    stats.pastDueRepaired++;
                } catch (err) {
                    stats.failed++;
                    logger.error(`[subscription-worker] reconciliation failed for PAST_DUE ${subscription.id}: ${err}`);
                }
            })
        ),
    ]);

    if (stuckActive.length > 0) {
        logger.warn(
            `[subscription-worker] reconcile: repaired ${stats.activeRepaired}/${stuckActive.length} ACTIVE subscriptions with past endsAt.`
        );
    }

    if (stuckPastDue.length > 0) {
        logger.warn(
            `[subscription-worker] reconcile: repaired ${stats.pastDueRepaired}/${stuckPastDue.length} PAST_DUE subscriptions beyond grace period.`
        );
    }

    return stats;
}

// ---------------------------------------------------------------------------
// Worker bootstrap
// ---------------------------------------------------------------------------
export const startSubscriptionWorker = (): void => {
    const paymentRepository = Container.get(PaymentRepository);
    const emailQueue = Container.get(EmailQueue);
    const walletService = Container.get(WalletService);
    const paymentService = Container.get(PaymentService);

    const worker = new Worker(
        SUBSCRIPTION_WORKER,
        async (job) => {
            if (job.name === jobs.PROCESS_RENEWALS) {
                const now = new Date();

                const [reminderStats, expiryStats, cancellationStats] = await Promise.all([
                    processReminders(paymentRepository, walletService, emailQueue, now),
                    processExpiries(paymentRepository, walletService, emailQueue, now),
                    processCancellations(emailQueue, now),
                ]);

                logStats(reminderStats);
                logStats(expiryStats);
                logStats(cancellationStats);
            } else if (job.name === jobs.PROCESS_TRIAL_SUBSCRIPTIONS) {
                const now = new Date();
                const trialStats = await processTrialExpirations(paymentRepository, paymentService, emailQueue, now);
                logStats(trialStats);
            } else if (job.name === jobs.RECONCILE_STUCK_SUBSCRIPTIONS) {
                const now = new Date();
                const reconciliationStats = await reconcileStuckSubscriptions(now);
                logStats(reconciliationStats);
            }
        },
        {
            connection: redisConnection,
            settings: { backoffStrategy: (attempt) => Math.min(attempt * 5_000, 30_000) },
        }
    );

    // Prevents unhandled worker errors from crashing the process
    worker.on("error", (err) => {
        logger.error(`[subscription-worker] worker error: ${err}`);
    });

    worker.on("failed", (job, err) => {
        logger.error(`[subscription-worker] job ${job?.name} failed: ${err}`);
    });
    logger.info("🔁 Subscription renewal worker started");
};