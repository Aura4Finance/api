import { NextFunction, Request, Response } from "express";
import logger from "./logger";
import "reflect-metadata"
import { AxiosError } from "axios";
import { HttpRequestError } from "./http-client";

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
      status: "error",
      message: err.message,
    });
  } else if (err instanceof HttpRequestError) {
    return res.status(err.status || 500).json({
      status: "error",
      message: err.message,
      code: err.code,
    });
  } else if (err instanceof AxiosError) {
    return res.status(err.response?.status || 500).json({
      status: "error",
      message: err.response?.data || "Something went wrong. Please try again.",
    });
  }
  else {
    return res.status(500).json({
      status: "error",
      message: "Something went wrong. Please try again.",
    });
  }
};
