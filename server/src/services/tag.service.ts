import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

export function listTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export async function createTag(name: string, color?: string) {
  const existing = await prisma.tag.findUnique({ where: { name } });
  if (existing) {
    throw new AppError(409, `Tag "${name}" already exists`);
  }
  return prisma.tag.create({ data: { name, color } });
}

export async function deleteTag(id: string) {
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) {
    throw new AppError(404, "Tag not found");
  }
  await prisma.tag.delete({ where: { id } });
}
