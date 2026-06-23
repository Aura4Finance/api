import Decimal from "decimal.js";

export function decimalToBigInt(amount: number | string, decimal: number): bigint {
    const decimalObj = new Decimal(amount);
    const bigInt = decimalObj.mul(Math.pow(10, decimal)).toFixed(0);
    return BigInt(bigInt);
}
