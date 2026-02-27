import db from "@/config/db-config";
import { Service } from "typedi";
import {encrypt} from "@/utils/encryption-handler";
import { Customer, Mode, Network, PaymentMethod, Token, TransactionStatus, TransactionType } from "../../generated/prisma";

type TransferAddress = {
  publicKey: string;
  privateKey: string;
};

type PaymentOptions =
  | {
      paymentMethod: PaymentMethod;
      redirectUrl: string;
    }
  | {
      paymentMethod: PaymentMethod
      paylinkId: string;
    };

@Service()
export class PaymentRepository {
  async createPayment(
    amount: number,
    amountInUSDC: number,
    currency: string,
    network: Network,
    customer: Customer,
    txRef: string,
    depositAddress: string,
    transferAddress: TransferAddress,
    userId: string,
    mode: Mode,
    options: PaymentOptions
  ) {
    const { encryptedData, iv, tag, key } = encrypt(transferAddress.privateKey);

    let redirectUrl: string;
    let paylinkConnect: any = undefined;

    if (options.paymentMethod === PaymentMethod.PAYMENT_LINK) {
      const paymentLinkOptions = options as any;
      redirectUrl = `${process.env.ORAFI_PAYLINK_URL}/${paymentLinkOptions.paylinkId}`;
      paylinkConnect = { connect: { id: paymentLinkOptions.paylinkId } };
    } else {
      const checkoutOptions = options as any;
      redirectUrl = checkoutOptions.redirectUrl;
    }

    const paymentData: any = {
      paymentMethod: options.paymentMethod,
      token: Token.USDC,
      txRef,
      depositAddress,
      redirectUrl,
      wallet: {
        create: {
          pubKey: transferAddress.publicKey,
          privateKey: {
            create: { encryptedData, iv, tag, key },
          },
        },
      },
    };

    if (paylinkConnect) {
      paymentData.paylink = paylinkConnect;
    }

  const tx = await db.transaction.create({
    data: {
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
      amount,
      currency,
      network,
      amountInUSDC,
      mode,
      token: Token.USDC,
      profile: {
        connect: { id: userId },
      },
      customer: {
        connect: { id: customer.id },
      },
      payment: {
        create: paymentData,
      },
    },
    select: {
      id: true,
      amount: true,
      amountInUSDC: true,
      mode: true,
      profile: {
        select: {
          id: true,
          businessName: true,
          user: {
            select: { email: true },
          },
        },
      },
      payment: {
        select: {
          id: true,
          depositAddress: true,
          wallet: {
            select: {
              pubKey: true,
            },
          },
          redirectUrl: true,
        },
      },
    },
  });

  return tx;
}

  async findPaymentById(id: string, userId?: string) {
    
    const where: any = { id };
    if (userId) {
      where.profile = { userId };
    }
    const result = await db.transaction.findFirst({
      where,
      include: {
        payment: {
          include: {
            wallet: {
              include: {
                privateKey: true,
              }
            }
          },
        },
        refund: true,
        profile: {
          include: {
            wallet: true,
            user: true,
          }
        },
        customer: true,
      }
    });

    return result;
  }

  async confirmPaymentStatus(txId: string) {
    const tx = await db.transaction.update({
      where: {
        id: txId,
      },
      data: {
        status: TransactionStatus.COMPLETED,
        confirmedAt: new Date()
      },
      include: {
        payment: true
      }
    });
    return tx;

  }

  async refundPayment(txId: string) {
    return await db.transaction.update({
      where: {
        id: txId
      },
      data: {
        payment: {
          update: {
            refunded: true
          }
        }
      },
      include: {
       customer: true
      }
    })
  }

}

