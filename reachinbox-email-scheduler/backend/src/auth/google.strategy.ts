import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env.js';
import { userRepository } from '../repositories/user.repository.js';

export const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

if (googleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Google profile is missing an email address'));
        }

        const name = profile.displayName || 'Google User';
        const avatarUrl = profile.photos?.[0]?.value || null;
        const googleId = profile.id;

        // 1. Check by googleId
        let user = await userRepository.findByGoogleId(googleId);
        if (user) {
          return done(null, user);
        }

        // 2. Check by email and link if exists
        user = await userRepository.findByEmail(email);
        if (user) {
          user = await userRepository.update(user.id, {
            googleId,
            avatarUrl: user.avatarUrl || avatarUrl,
          });
          return done(null, user);
        }

        // 3. Create new user
        user = await userRepository.create({
          email,
          name,
          googleId,
          avatarUrl,
        });

        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    },
    ),
  );
}

export default passport;
