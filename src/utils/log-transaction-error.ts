import { SuiClientTypes } from "@mysten/sui/client";
import logger from "@/utils/logger";
export const logTransactionError = (tx: SuiClientTypes.TransactionResult<{
    effects: true
}>) => {
    if(tx.$kind !== "FailedTransaction") return;

    const errorStatus = tx.FailedTransaction.effects?.status;
    const errorKind = tx.FailedTransaction.effects?.status?.error?.$kind;
    const errorMessage = tx.FailedTransaction.effects?.status?.error?.message;

switch (errorKind) {
    case "MoveAbort":
        logger.error(`Refund transaction aborted with error: ${errorMessage}, abort code: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "CommandArgumentError":
        logger.error(`Refund transaction execution failed with error: ${errorMessage}, failure status: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "IndexError":
        logger.error(`Refund transaction failed with index error: ${errorMessage}, failure status: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "TypeArgumentError":
        logger.error(`Refund transaction failed with type error: ${errorMessage}, failure status: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "CongestedObjects":
        logger.error(`Refund transaction failed due to congested objects: ${errorMessage}, congested object IDs: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "PackageUpgradeError":
        logger.error(`Refund transaction failed due to package upgrade error: ${errorMessage}, failure status: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "ObjectIdError":
        logger.error(`Refund transaction failed due to object ID error: ${errorMessage}, object ID: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "SizeError":
        logger.error(`Refund transaction failed due to size error: ${errorMessage}, failure status: ${errorStatus?.error?.command?.toString()}`);
        break;
    case "CoinDenyListError":
        logger.error(`Refund transaction failed due to coin deny list error: ${errorMessage}, failure status: ${errorStatus?.error?.command?.toString()}`);
        break;
    default:
        logger.error(`Refund transaction failed with unknown error: ${errorMessage}, failure status: ${errorStatus?.toString()}`);
}
}