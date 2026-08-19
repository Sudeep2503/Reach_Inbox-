import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { authService } from './auth.service.js';
import { sendSuccess } from '../utils/response.js';

export const authController = {
  googleCallback: async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      return;
    }

    const session = await authService.createSession(user.id);

    res.cookie(env.SESSION_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.SESSION_COOKIE_SAME_SITE,
      path: '/',
      maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  },

  getMe: async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    sendSuccess(res, {
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  },

  logout: async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    if (token) {
      await authService.logout(token);
    }

    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.SESSION_COOKIE_SAME_SITE,
      path: '/',
    });

    sendSuccess(res, { loggedOut: true });
  },
};
