import { prisma } from "@octopus/db";
import { orgLimitReached } from "@/lib/constants";

export async function canUserCreateOrg(userId: string): Promise<boolean> {
  const count = await prisma.organizationMember.count({
    where: {
      userId,
      role: "owner",
      deletedAt: null,
      organization: { deletedAt: null },
    },
  });
  return !orgLimitReached(count);
}

export async function isFirstOrgForUser(userId: string): Promise<boolean> {
  const count = await prisma.organizationMember.count({
    where: {
      userId,
      role: "owner",
      organization: { deletedAt: null },
    },
  });
  return count === 0;
}
