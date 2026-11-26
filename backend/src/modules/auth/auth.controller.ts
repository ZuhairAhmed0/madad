import type { RequestHandler } from "express";
import { loginSchema } from "./auth.schemas";
import * as authService from "./auth.service";

const AUTH_COOKIE_NAME = "madad_token";

const isProduction = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  secure: isProduction,
};

export const loginHandler: RequestHandler = async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const result = await authService.login(email, password);

  res.cookie(AUTH_COOKIE_NAME, result.token, {
    ...baseCookieOptions,
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.status(200).json(result);
};

export const logoutHandler: RequestHandler = (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, baseCookieOptions);
  res.status(200).json({ ok: true });
};

export const meHandler: RequestHandler = (req, res) => {
  const { organization, ...user } = req.user!;
  res.status(200).json({ user, organization });
};
