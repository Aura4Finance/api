import { NextFunction, Request, Response } from "express";
import logger from "./logger";
import "reflect-metadata"
import { AxiosError } from "axios";

export class APIError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "APIError";
  }
}

export const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const globalErrorHandler = (
  err: Error,
  _: Request,
  res: Response,
  __: NextFunction
) => {
  logger.error(err.stack);

  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      status: "Error",
      message: err.message,
    });
  } else if (err instanceof AxiosError) {
    return res.status(err.response?.status || 500).json({
      status: "error",
      message: err.response?.data || "An unexpected error occured",
    });
  }
  else {
    return res.status(500).json({
      status: "error",
      message: "An unexpected error occured",
    });
  }
};
