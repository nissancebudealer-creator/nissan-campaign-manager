import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAuthToken } from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../config/roles.js";

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: { name: string };
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    role: user.role.name,
  };
}

// The first registered user becomes Administrator; everyone after defaults to
// Viewer until an admin assigns a proper role via the Administration module.
export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const userCount = await prisma.user.count();
  const roleName = userCount === 0 ? ROLES.ADMINISTRATOR : ROLES.VIEWER;
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    throw new AppError(500, `Role "${roleName}" is not seeded. Run the database seed script.`);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      roleId: role.id,
    },
    include: { role: true },
  });

  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role.name });
  return { token, user: publicUser(user) };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role.name });
  return { token, user: publicUser(user) };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) {
    throw new AppError(404, "User not found");
  }
  return publicUser(user);
}
