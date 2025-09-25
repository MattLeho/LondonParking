import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { env } from '../../config/env.js';
import { httpError } from '../../lib/http-error.js';

export type AuthContext = {
  subject: string | null;
  roles: Set<string>;
  claims: JWTPayload;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }

  interface FastifyInstance {
    requireGuest: preHandlerHookHandler;
    requireAdmin: preHandlerHookHandler;
  }
}

type RoleRequirement = 'guest' | 'admin';
type JwtVerifier = (token: string | null) => Promise<AuthContext>;
const ROLE_CLAIM_CANDIDATES = [
  'roles',
  'role',
  'permissions',
  'scope',
  'https://schemas.dev/roles',
] as const;
const buildJwtVerifier = (
  app: FastifyInstance,
): { verifier: JwtVerifier; authDisabled: boolean } => {
  if (env.AUTH_JWKS_URL && env.AUTH_AUDIENCE && env.AUTH_ISSUER) {
    const jwks = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL));

    const verifier: JwtVerifier = async (token) => {
      if (!token) {
        throw httpError(401, 'Missing Authorization header');
      }
      const { payload } = await jwtVerify(token, jwks, {
        audience: env.AUTH_AUDIENCE,
        issuer: env.AUTH_ISSUER,
      });

      const roles = extractRoles(payload);

      return {
        subject: typeof payload.sub === 'string' ? payload.sub : null,
        roles,
        claims: payload,
      };
    };
    return { verifier, authDisabled: false };
  }

  app.log.warn(
    'AUTH_JWKS_URL/AUTH_AUDIENCE/AUTH_ISSUER missing; falling back to permissive guest mode. Do not use in production.',
  );
  return {
    verifier: () =>
      Promise.resolve({
        subject: null,
        roles: new Set([env.GUEST_ROLE]),
        claims: {},
      }),
    authDisabled: true,
  };
};

const extractRoles = (payload: JWTPayload): Set<string> => {
  for (const key of ROLE_CLAIM_CANDIDATES) {
    const value = payload[key];
    if (typeof value === 'string') {
      if (key === 'scope') {
        return new Set(value.split(' ').filter(Boolean));
      }
      return new Set([value]);
    }
    if (Array.isArray(value)) {
      return new Set(value.filter((item): item is string => typeof item === 'string'));
    }
  }

  return new Set();
};

const ensureRole = async (
  request: FastifyRequest,
  _reply: FastifyReply,
  verifier: JwtVerifier,
  requirement: RoleRequirement,
  authDisabled: boolean,
): Promise<void> => {
  let context: AuthContext;

  if (authDisabled) {
    context = await verifier(null);
  } else {
    const header = request.headers.authorization;

    if (!header) {
      if (requirement === 'guest') {
        context = {
          subject: null,
          roles: new Set([env.GUEST_ROLE]),
          claims: {},
        };
      } else {
        throw httpError(401, 'Missing Authorization header');
      }
    } else {
      const token = extractBearerToken(header);

      try {
        context = await verifier(token);
      } catch (error) {
        request.log.warn({ err: error }, 'token verification failed');
        throw httpError(401, 'Invalid authorization token');
      }
    }
  }

  if (requirement === 'guest') {
    request.auth = context;
    return;
  }

  const requiredRole = env.ADMIN_ROLE;

  if (!context.roles.has(requiredRole)) {
    throw httpError(403, 'Insufficient role');
  }

  request.auth = context;
};
const extractBearerToken = (header: string): string => {
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') {
    throw httpError(401, 'Authorization header must be a Bearer token');
  }

  return token;
};

export const authPlugin = fp((app) => {
  const { verifier, authDisabled } = buildJwtVerifier(app);

  const makeHandler = (requirement: RoleRequirement): preHandlerHookHandler => {
    return async (request, reply) => {
      await ensureRole(request, reply, verifier, requirement, authDisabled);
    };
  };

  app.decorate('requireGuest', makeHandler('guest'));
  app.decorate('requireAdmin', makeHandler('admin'));
});

export default authPlugin;
