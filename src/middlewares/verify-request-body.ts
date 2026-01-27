import { NextFunction, Request, Response } from "express";
import { APIError } from "../utils/error-handler";
import { STATUS } from "../constants/status.constant";

export const verifyRequestBody = (
  req: Request,
  _: Response,
  next: NextFunction
) => {
  const body = req.body;

  if (!body) {
    next();
  }

  if (!body || typeof body !== "object") {
    throw new APIError("Invalid request data", STATUS.bad);
  }

  next();
};
