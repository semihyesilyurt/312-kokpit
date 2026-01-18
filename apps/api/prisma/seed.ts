import { PrismaClient, UserRole, Platform, RuleActionType, RuleStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Branch
  const branch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: '312 Doner Merkez',
      address: 'Ataturk Cad. No:123, Cankaya/Ankara',
      phone: '+90 312 123 4567',
      latitude: 39.9334,
      longitude: 32.8597,
      isActive: true,
      workingHours: {
        monday: { open: '10:00', close: '23:00' },
        tuesday: { open: '10:00', close: '23:00' },
        wednesday: { open: '10:00', close: '23:00' },
        thursday: { open: '10:00', close: '23:00' },
        friday: { open: '10:00', close: '00:00' },
        saturday: { open: '10:00', close: '00:00' },
        sunday: { open: '11:00', close: '22:00' },
      },
    },
  });
  console.log('Branch created:', branch.name);

  // 2. Create Admin User
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@312doner.com' },
    update: {},
    create: {
      email: 'admin@312doner.com',
      password: hashedPassword,
      name: 'Admin',
      phone: '+90 555 123 4567',
      role: UserRole.ADMIN,
      branchId: branch.id,
    },
  });
  console.log('Admin user created:', admin.email);

  // 3. Create Categories
  const categories = [
    { name: 'Donerler', slug: 'donerler', sortOrder: 1 },
    { name: 'Iskenderler', slug: 'iskenderler', sortOrder: 2 },
    { name: 'Pideler', slug: 'pideler', sortOrder: 3 },
    { name: 'Lahmacunlar', slug: 'lahmacunlar', sortOrder: 4 },
    { name: 'Icecekler', slug: 'icecekler', sortOrder: 5 },
    { name: 'Tatlilar', slug: 'tatlilar', sortOrder: 6 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log('Categories created');

  // 4. Create Ingredients
  const ingredients = [
    { name: 'Dana Doner Eti', unit: 'kg', unitCost: 450, minStock: 5 },
    { name: 'Tavuk Doner Eti', unit: 'kg', unitCost: 280, minStock: 5 },
    { name: 'Lavas Ekmek', unit: 'adet', unitCost: 3, minStock: 50 },
    { name: 'Pide Ekmek', unit: 'adet', unitCost: 5, minStock: 30 },
    { name: 'Domates', unit: 'kg', unitCost: 25, minStock: 3 },
    { name: 'Sogan', unit: 'kg', unitCost: 15, minStock: 3 },
    { name: 'Biber', unit: 'kg', unitCost: 30, minStock: 2 },
    { name: 'Salatalik', unit: 'kg', unitCost: 20, minStock: 2 },
    { name: 'Tereyagi', unit: 'kg', unitCost: 350, minStock: 2 },
    { name: 'Yogurt', unit: 'kg', unitCost: 80, minStock: 5 },
    { name: 'Ayran', unit: 'adet', unitCost: 5, minStock: 100 },
    { name: 'Kola 330ml', unit: 'adet', unitCost: 12, minStock: 50 },
    { name: 'Su 500ml', unit: 'adet', unitCost: 3, minStock: 100 },
    { name: 'Kunefe', unit: 'porsiyon', unitCost: 35, minStock: 10 },
  ];

  const createdIngredients: any = {};
  for (const ing of ingredients) {
    const created = await prisma.ingredient.upsert({
      where: { id: ingredients.indexOf(ing) + 1 },
      update: {},
      create: ing,
    });
    createdIngredients[ing.name] = created;

    // Create initial stock
    await prisma.stockItem.upsert({
      where: { ingredientId_branchId: { ingredientId: created.id, branchId: branch.id } },
      update: {},
      create: {
        ingredientId: created.id,
        branchId: branch.id,
        currentStock: ing.minStock * 3,
        theoreticalStock: ing.minStock * 3,
        minStock: ing.minStock,
        maxStock: ing.minStock * 5,
      },
    });
  }
  console.log('Ingredients and stock created');

  // 5. Create Products with Recipes
  const donerCategory = await prisma.category.findUnique({ where: { slug: 'donerler' } });
  const iskenderCategory = await prisma.category.findUnique({ where: { slug: 'iskenderler' } });
  const icecekCategory = await prisma.category.findUnique({ where: { slug: 'icecekler' } });

  const products = [
    {
      name: 'Doner Durum',
      slug: 'doner-durum',
      categoryId: donerCategory!.id,
      basePrice: 120,
      cost: 45,
      preparationTime: 8,
      platformPrices: { GETIR: 135, YEMEKSEPETI: 130, TRENDYOL: 128 },
      recipe: [
        { ingredientName: 'Dana Doner Eti', quantity: 0.15 },
        { ingredientName: 'Lavas Ekmek', quantity: 1 },
        { ingredientName: 'Domates', quantity: 0.05 },
        { ingredientName: 'Sogan', quantity: 0.03 },
      ],
    },
    {
      name: 'Tavuk Doner Durum',
      slug: 'tavuk-doner-durum',
      categoryId: donerCategory!.id,
      basePrice: 100,
      cost: 35,
      preparationTime: 8,
      platformPrices: { GETIR: 115, YEMEKSEPETI: 110, TRENDYOL: 108 },
      recipe: [
        { ingredientName: 'Tavuk Doner Eti', quantity: 0.15 },
        { ingredientName: 'Lavas Ekmek', quantity: 1 },
        { ingredientName: 'Domates', quantity: 0.05 },
        { ingredientName: 'Sogan', quantity: 0.03 },
      ],
    },
    {
      name: 'Porsiyon Doner',
      slug: 'porsiyon-doner',
      categoryId: donerCategory!.id,
      basePrice: 180,
      cost: 75,
      preparationTime: 10,
      platformPrices: { GETIR: 200, YEMEKSEPETI: 195, TRENDYOL: 190 },
      recipe: [
        { ingredientName: 'Dana Doner Eti', quantity: 0.25 },
        { ingredientName: 'Pide Ekmek', quantity: 1 },
        { ingredientName: 'Domates', quantity: 0.08 },
        { ingredientName: 'Biber', quantity: 0.05 },
      ],
    },
    {
      name: 'Iskender',
      slug: 'iskender',
      categoryId: iskenderCategory!.id,
      basePrice: 220,
      cost: 95,
      preparationTime: 12,
      platformPrices: { GETIR: 250, YEMEKSEPETI: 240, TRENDYOL: 235 },
      recipe: [
        { ingredientName: 'Dana Doner Eti', quantity: 0.2 },
        { ingredientName: 'Pide Ekmek', quantity: 1.5 },
        { ingredientName: 'Tereyagi', quantity: 0.03 },
        { ingredientName: 'Yogurt', quantity: 0.15 },
        { ingredientName: 'Domates', quantity: 0.1 },
      ],
    },
    {
      name: 'Ayran',
      slug: 'ayran',
      categoryId: icecekCategory!.id,
      basePrice: 20,
      cost: 5,
      preparationTime: 1,
      platformPrices: { GETIR: 22, YEMEKSEPETI: 22, TRENDYOL: 21 },
      recipe: [{ ingredientName: 'Ayran', quantity: 1 }],
    },
    {
      name: 'Kola',
      slug: 'kola',
      categoryId: icecekCategory!.id,
      basePrice: 30,
      cost: 12,
      preparationTime: 1,
      platformPrices: { GETIR: 35, YEMEKSEPETI: 33, TRENDYOL: 32 },
      recipe: [{ ingredientName: 'Kola 330ml', quantity: 1 }],
    },
    {
      name: 'Su',
      slug: 'su',
      categoryId: icecekCategory!.id,
      basePrice: 10,
      cost: 3,
      preparationTime: 1,
      platformPrices: { GETIR: 12, YEMEKSEPETI: 11, TRENDYOL: 11 },
      recipe: [{ ingredientName: 'Su 500ml', quantity: 1 }],
    },
  ];

  for (const prod of products) {
    const { recipe, ...productData } = prod;
    const product = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {},
      create: productData,
    });

    for (const recipeItem of recipe) {
      const ingredient = createdIngredients[recipeItem.ingredientName];
      if (ingredient) {
        await prisma.recipeItem.upsert({
          where: { productId_ingredientId: { productId: product.id, ingredientId: ingredient.id } },
          update: { quantity: recipeItem.quantity },
          create: {
            productId: product.id,
            ingredientId: ingredient.id,
            quantity: recipeItem.quantity,
          },
        });
      }
    }
  }
  console.log('Products and recipes created');

  // 6. Create Platform Configs
  const platforms = [
    { platform: Platform.GETIR, commissionRate: 28, isActive: false },
    { platform: Platform.YEMEKSEPETI, commissionRate: 25, isActive: false },
    { platform: Platform.TRENDYOL, commissionRate: 20, isActive: false },
  ];

  for (const pc of platforms) {
    await prisma.platformConfig.upsert({
      where: { platform: pc.platform },
      update: {},
      create: pc,
    });
  }
  console.log('Platform configs created');

  // 7. Create Default Rules
  const rules = [
    {
      name: 'Kurye Yoksa Platformlari Kapat',
      description: 'Musait kurye kalmadiginda platformlari otomatik kapat',
      condition: { field: 'available_couriers', operator: '==', value: 0 },
      actionType: RuleActionType.CLOSE_PLATFORM,
      actionParams: { platforms: ['GETIR', 'YEMEKSEPETI', 'TRENDYOL'] },
      priority: 100,
      cooldownMinutes: 5,
      status: RuleStatus.ACTIVE,
    },
    {
      name: 'Uzun Teslimat Suresi Uyarisi',
      description: 'Ortalama teslimat suresi 45dk yi gecerse uyari gonder',
      condition: { field: 'average_delivery_time', operator: '>', value: 45 },
      actionType: RuleActionType.SEND_NOTIFICATION,
      actionParams: { channel: 'IN_APP', title: 'Teslimat Suresi Uyarisi', body: 'Ortalama teslimat 45dk uzeri!' },
      priority: 80,
      cooldownMinutes: 15,
      status: RuleStatus.ACTIVE,
    },
    {
      name: 'Fire Orani Yuksek',
      description: 'Fire orani %5 uzerindeyse uyari gonder',
      condition: { field: 'waste_rate', operator: '>', value: 5 },
      actionType: RuleActionType.SEND_NOTIFICATION,
      actionParams: { channel: 'IN_APP', title: 'Yuksek Fire', body: 'Fire orani %5 uzerinde!' },
      priority: 70,
      cooldownMinutes: 60,
      status: RuleStatus.ACTIVE,
    },
  ];

  for (const rule of rules) {
    await prisma.rule.upsert({
      where: { id: rules.indexOf(rule) + 1 },
      update: {},
      create: rule,
    });
  }
  console.log('Default rules created');

  // 8. Create Settings
  const settings = [
    { key: 'delivery_fee', value: { amount: 15, freeAbove: 200 }, description: 'Teslimat ucreti ayarlari' },
    { key: 'max_orders_per_courier', value: { max: 3 }, description: 'Kurye basina max siparis' },
    { key: 'default_preparation_time', value: { minutes: 15 }, description: 'Varsayilan hazirlama suresi' },
    { key: 'late_delivery_threshold', value: { minutes: 45 }, description: 'Gec teslimat esigi' },
    { key: 'loyalty_trigger_order_count', value: { count: 3, promoCode: '312DIREKT', discount: 20 }, description: 'Sadakat tetikleme' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log('Settings created');

  // 9. Create sample courier
  const courierUser = await prisma.user.upsert({
    where: { email: 'kurye1@312doner.com' },
    update: {},
    create: {
      email: 'kurye1@312doner.com',
      password: await bcrypt.hash('kurye123', 10),
      name: 'Ahmet Kurye',
      phone: '+90 555 111 2233',
      role: UserRole.COURIER,
      branchId: branch.id,
    },
  });

  await prisma.courier.upsert({
    where: { userId: courierUser.id },
    update: {},
    create: {
      userId: courierUser.id,
      branchId: branch.id,
      vehicleType: 'Motorsiklet',
      vehiclePlate: '06 ABC 123',
      performanceScore: 85,
    },
  });
  console.log('Sample courier created');

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
