import { NextFunction, Request, Response } from "express";
import { APIError } from "../utils/error-handler";
import { STATUS } from "../constants/status.constant";

export const verifyRequestBody = (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const body = req.body;

  // Allow requests with no body or empty body
  if (!body || Object.keys(body).length === 0) {
    return next();
  }

  // Only validate if body exists and has content
  if (typeof body !== "object") {
    throw new APIError("Request body must be a valid JSON object.", STATUS.bad);
  }

  next();
};
