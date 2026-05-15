import db from "@/config/db-config";
import { Service } from "typedi";
import { 
  Customer, 
  Mode, 
  Network, 
  PaymentMethod, 
  TransactionStatus, 
  TransactionType,
  Token
 } from "../../generated/prisma";


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
    userId: string,
    mode: Mode,
    options: PaymentOptions
  ) {

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
      txRef,
      redirectUrl,
    };

    if (paylinkConnect) {
      paymentData.paylink = paylinkConnect;
    }

  const tx = await db.transaction.create({
    data: {
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
      token: Token.USDC,
      amount,
      currency,
      network,
      amountInUSDC,
      mode,
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
      currency: true,
      network: true,
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
            redirectUrl: true
          }
        }
    },
  });

  return tx;
}

  async findPaymentById(id: string, profileId?: string) {
    
    const where: any = { id };
    if (profileId) {
      where.profileId = profileId;
    }
    const result = await db.transaction.findFirst({
      where,
      include: {
        payment: {
          include: {
            wallet: true,
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

  async addTransferAddressToPayment(
    txId: string,
    address: string,
    derivationIndex: number
  ){
    await db.transaction.update({
      where: {
        id: txId
      },
      data: {
        payment: {
          update: {
            wallet: {
              create: {
                address,
                derivationIndex
              }
            }
          }
        }
      }
    })
  }

  async addDepositAddressToPayment(
    txId: string,
    depositAddress: string,
    token: Token
  ){
    await db.transaction.update({
      where: {
        id: txId
      },
      data: {
        token,
        payment: {
          update: {
            depositAddress
          }
        }
      }
    })
  }

  async confirmPaymentStatus(
    txId: string,
    token?: Token
  ) {
    const tx = await db.transaction.update({
      where: {
        id: txId,
      },
      data: {
        ...( token? {token}: {}),
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

