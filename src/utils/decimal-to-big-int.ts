import Decimal from "decimal.js";

export function decimalToBigInt(amount: number | string, decimal: number): bigint {
    const decimalObj = new Decimal(amount);
    const multiplier = Decimal.pow(10, decimal);
    const bigIntString = decimalObj.mul(multiplier).toFixed(0);
    return BigInt(bigIntString);
}

export function bigIntToDecimal(amount: bigint, decimal: number, toFixed: number): string {
    const decimalObj = new Decimal(amount.toString());
    const divisor = Decimal.pow(10, decimal);
    return decimalObj.div(divisor).toFixed(toFixed);
}