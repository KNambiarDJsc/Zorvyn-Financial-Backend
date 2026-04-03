import { PrismaClient, RoleName, RecordType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const DEMO_PASSWORD = "Password123!";

async function main(): Promise<void> {
    console.log("🌱 Starting database seed...\n");

    // ── Roles ──────────────────────────────────────────────────────────────────
    const [viewerRole, analystRole, adminRole] = await Promise.all([
        prisma.role.upsert({
            where: { name: RoleName.VIEWER },
            update: {},
            create: {
                name: RoleName.VIEWER,
                description: "Read-only access to dashboard data",
            },
        }),
        prisma.role.upsert({
            where: { name: RoleName.ANALYST },
            update: {},
            create: {
                name: RoleName.ANALYST,
                description: "Can view records and access analytics insights",
            },
        }),
        prisma.role.upsert({
            where: { name: RoleName.ADMIN },
            update: {},
            create: {
                name: RoleName.ADMIN,
                description: "Full CRUD access — create, update, delete records and manage users",
            },
        }),
    ]);
    console.log("✅ Roles seeded: VIEWER, ANALYST, ADMIN");

    // ── Organization ───────────────────────────────────────────────────────────
    const org = await prisma.organization.upsert({
        where: { slug: "zorvyn-demo" },
        update: {},
        create: { name: "Zorvyn Demo Corp", slug: "zorvyn-demo" },
    });
    console.log(`✅ Organization seeded: ${org.name} (${org.slug})`);

    // ── Users ──────────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

    const [adminUser] = await Promise.all([
        prisma.user.upsert({
            where: { email: "admin@zorvyn.com" },
            update: {},
            create: {
                orgId: org.id,
                roleId: adminRole.id,
                email: "admin@zorvyn.com",
                passwordHash,
                firstName: "Alice",
                lastName: "Admin",
            },
        }),
        prisma.user.upsert({
            where: { email: "analyst@zorvyn.com" },
            update: {},
            create: {
                orgId: org.id,
                roleId: analystRole.id,
                email: "analyst@zorvyn.com",
                passwordHash,
                firstName: "Bob",
                lastName: "Analyst",
            },
        }),
        prisma.user.upsert({
            where: { email: "viewer@zorvyn.com" },
            update: {},
            create: {
                orgId: org.id,
                roleId: viewerRole.id,
                email: "viewer@zorvyn.com",
                passwordHash,
                firstName: "Carol",
                lastName: "Viewer",
            },
        }),
    ]);
    console.log("✅ Users seeded: admin, analyst, viewer");

    // ── Financial Records (6 months of realistic data) ────────────────────────
    const categories = {
        [RecordType.INCOME]: ["salary", "freelance", "consulting", "investment", "bonus"],
        [RecordType.EXPENSE]: ["rent", "utilities", "food", "transport", "healthcare", "software", "marketing", "entertainment"],
    };

    const records: Array<{
        orgId: string;
        userId: string;
        amount: number;
        type: RecordType;
        category: string;
        description: string;
        date: Date;
    }> = [];

    // Generate 6 months × realistic entries
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const baseDate = new Date();
        baseDate.setMonth(baseDate.getMonth() - monthOffset);

        // Monthly salary
        records.push({
            orgId: org.id,
            userId: adminUser.id,
            amount: 8500,
            type: RecordType.INCOME,
            category: "salary",
            description: `Monthly salary — ${baseDate.toLocaleString("default", { month: "long", year: "numeric" })}`,
            date: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
        });

        // Monthly rent
        records.push({
            orgId: org.id,
            userId: adminUser.id,
            amount: 2200,
            type: RecordType.EXPENSE,
            category: "rent",
            description: `Office rent — ${baseDate.toLocaleString("default", { month: "long", year: "numeric" })}`,
            date: new Date(baseDate.getFullYear(), baseDate.getMonth(), 2),
        });

        // Variable income + expenses
        for (let i = 0; i < 8; i++) {
            const isIncome = Math.random() > 0.55;
            const type = isIncome ? RecordType.INCOME : RecordType.EXPENSE;
            const catList = categories[type];
            const category = catList[Math.floor(Math.random() * catList.length)] ?? "other";
            const day = Math.floor(Math.random() * 27) + 1;

            records.push({
                orgId: org.id,
                userId: adminUser.id,
                amount: parseFloat((Math.random() * 2000 + 50).toFixed(2)),
                type,
                category,
                description: `${category.charAt(0).toUpperCase() + category.slice(1)} — entry ${i + 1}`,
                date: new Date(baseDate.getFullYear(), baseDate.getMonth(), day),
            });
        }
    }

    await prisma.financialRecord.createMany({ data: records, skipDuplicates: true });
    console.log(`✅ Financial records seeded: ${records.length} entries across 6 months`);

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log("\n──────────────────────────────────────────");
    console.log("🎉 Seed complete!\n");
    console.log("📋 Demo Credentials (password: Password123!)");
    console.log("   Role     Email");
    console.log("   ──────── ──────────────────────");
    console.log("   ADMIN    admin@zorvyn.com");
    console.log("   ANALYST  analyst@zorvyn.com");
    console.log("   VIEWER   viewer@zorvyn.com");
    console.log("──────────────────────────────────────────\n");
}

main()
    .catch((err) => {
        console.error("❌ Seed failed:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
