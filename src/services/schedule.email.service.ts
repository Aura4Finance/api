import { emailQueue, jobs } from "@/queues/email.queue";
import { Service } from "typedi";

@Service()
export class EmailQueue {
    async addOnboardEmailScheduler() {
        await emailQueue.add(
            jobs.ONBOARDED,
            {},
            {
                repeat: {
                    every: 1000 * 60 * 60 * 24 * 7 // every 7 days
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        )
    }

    async addPaymentFailedScheduler(
        email: string,
        name: string,
        amount: number,
        reference: string,
        currency: string = "NGN"
    ) {
        await emailQueue.add(
            jobs.PAYMENT_FAILED,
            {
                email,
                name,
                amount,
                reference,
                currency
            },
            {
                delay: 1000 * 10,
                removeOnComplete: true,
                removeOnFail: false
            }
        )
    }

    async addPaymentSuccessScheduler(
        customerEmail: string,
        customerName: string,
        amount: number,
        reference: string,
        merchantName: string,
        merchantEmail: string,
        currency: string = "NGN"
    ) {
        await emailQueue.add(
            jobs.PAYMENT_SUCCESS,
            {
                email: customerEmail,
                name: customerName,
                amount,
                reference,
                currency,
                merchantEmail,
                merchantName
            },
            {
                delay: 1000 * 10,
                removeOnComplete: true,
                removeOnFail: false
            }
        )
    }

    async addScheduler(user: {
        email: string,
        firstName: string
    }) {
        await emailQueue.add(
            jobs.WELCOME,
            {
                email: user.email,
                name: user.firstName
            },
            {
                delay: 1000 * 60 * 15, //15 minutes
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                }
            }
        );

        await emailQueue.add(
            jobs.PROBLEMS,
            {
                email: user.email,
                name: user.firstName
            },
            {
                delay: 1000 * 60 * 60 * 24, //1 day
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                }
            }
        );

        await emailQueue.add(
            jobs.OFFERS,
            {
                email: user.email
            },
            {
                delay: 1000 * 60 * 60 * 24 * 3, //3 days
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                }
            }
        );
    }

    async addSubscriptionReminderScheduler(data: {
        email: string;
        customerName: string;
        merchantName: string;
        planName: string;
        duration: string;
        amount: number;
        currency: string;
        daysLeft: number;
        expiresAt: string;
        checkoutUrl?: string;
    }) {
        await emailQueue.add(
            jobs.SUBSCRIPTION_REMINDER,
            data,
            {
                delay: 1000 * 10,
                removeOnComplete: true,
                removeOnFail: false,
            }
        );
    }

    async addSubscriptionExpiredScheduler(data: {
        email: string;
        customerName: string;
        merchantName: string;
        planName: string;
        duration: string;
        expiresAt: string;
        checkoutUrl?: string;
    }) {
        await emailQueue.add(
            jobs.SUBSCRIPTION_EXPIRED,
            data,
            {
                delay: 1000 * 10,
                removeOnComplete: true,
                removeOnFail: false,
            }
        );
    }

    async addSubscriptionTrialEndedScheduler(data: {
        email: string;
        customerName: string;
        merchantName: string;
        planName: string;
        duration: string;
        trialDays: number;
        graceHours: number;
        trialEndedAt: string;
        checkoutUrl?: string;
    }) {
        await emailQueue.add(
            jobs.SUBSCRIPTION_TRIAL_ENDED,
            data,
            {
                delay: 1000 * 10,
                removeOnComplete: true,
                removeOnFail: false,
            }
        );
    }

    async addSubscriptionCancelledScheduler(data: {
        email: string;
        customerName: string;
        merchantName: string;
        planName: string;
        duration: string;
        cancelledAt: string;
        expiresAt?: string;
    }) {
        await emailQueue.add(
            jobs.SUBSCRIPTION_CANCELLED,
            data,
            {
                delay: 1000 * 10,
                removeOnComplete: true,
                removeOnFail: false,
            }
        );
    }

        async addSubscriptionActiveScheduler(data: {
            email: string;
            customerName: string;
            merchantName: string;
            planName: string;
            duration: string;
            amount?: number;
            currency?: string;
            startsAt: string;
            expiresAt: string;
        }) {
            await emailQueue.add(
                jobs.SUBSCRIPTION_ACTIVE,
                data,
                {
                    delay: 1000 * 10,
                    removeOnComplete: true,
                    removeOnFail: false,
                }
            );
        }

        async addSubscriptionAbandonedScheduler(data: {
            email: string;
            customerName: string;
            merchantName: string;
            planName: string;
            checkoutUrl?: string;
        }) {
            await emailQueue.add(
                jobs.SUBSCRIPTION_ABANDONED,
                data,
                {
                    delay: 1000 * 10,
                    removeOnComplete: true,
                    removeOnFail: false,
                }
            );
        }
}