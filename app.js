import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { assert } from "superstruct";
import {
  CreateUser,
  PatchUser,
  CreateProduct,
  PatchProduct,
  CreateOrder,
  PatchOrder,
  PostSavedProduct,
} from "./structs.js";

const prisma = new PrismaClient();

const app = express();

app.use(cors());
app.use(express.json());

function asyncHandler(handler) {
  return async function (req, res) {
    try {
      await handler(req, res);
    } catch (e) {
      // 유효성 검사 오류
      if (
        e.name === "StructError" || // 유효성 검사 라이브러리에서 발생하는 오류 (ex. superstruct)
        e instanceof Prisma.PrismaClientValidationError // 프리즈마의 유효성 검사 오류
      ) {
        res.status(400).send({ message: e.message });
        // 특정 요청에 대해 리소스를 찾지 못한 경우
      } else if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025" // 프리즈마의 KnownRequestError로, 특정 리소스를 찾지 못했음을 나타냄
      ) {
        res.sendStatus(404);
        // 기타 서버 오류인 경우
      } else {
        res.status(500).send({ message: e.message });
      }
    }
  };
}

/*********** users ***********/

// 유저 목록 조회
app.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { offset = 0, limit = 10, order = "newest" } = req.query;
    let orderBy;
    switch (order) {
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
    }
    const users = await prisma.user.findMany({
      orderBy,
      skip: parseInt(offset),
      take: parseInt(limit),
      include: {
        // include 안에서는 관계필드만 suggest 함.
        userPreference: {
          select: {
            receiveEmail: true,
          },
        },
      },
    });
    res.send(users);
  })
);

// id에 해당하는 유저 조회
app.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        userPreference: true,
      },
    });
    res.send(user);
  })
);

// 리퀘스트 바디 내용으로 유저 생성
app.post(
  "/users",
  asyncHandler(async (req, res) => {
    assert(req.body, CreateUser);
    const { userPreference, ...userFields } = req.body;
    const user = await prisma.user.create({
      data: {
        ...userFields,
        userPreference: {
          create: userPreference,
        },
      },
      include: {
        userPreference: true,
      },
    });
    res.status(201).send(user);
  })
);

// 리퀘스트 바디 내용으로 id에 해당하는 유저 수정
app.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    assert(req.body, PatchUser);
    const { id } = req.params;
    const { userPreference, ...userFields } = req.body;
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...userFields,
        userPreference: {
          update: userPreference,
        },
      },
      include: {
        userPreference: true,
      },
    });
    res.send(user);
  })
);

// id에 해당하는 유저 삭제
app.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.sendStatus(204);
  })
);

app.get(
  "/users/:id/saved-products",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { savedProducts } = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        savedProducts: true,
      },
    });
    res.send(savedProducts);
  })
);

app.post(
  "/users/:id/saved-products",
  asyncHandler(async (req, res) => {
    assert(req.body, PostSavedProduct);
    const { id: userId } = req.params;
    const { productId } = req.body;
    const { savedProducts } = await prisma.user.update({
      where: { id: userId },
      data: {
        savedProducts: {
          connect: {
            // 연결테이블에 유저와 상품ID값을 저장해서 연결해줌.
            id: productId,
          },
        },
      },
      include: {
        savedProducts: true,
      },
    });
    res.send(savedProducts);
  })
);

/*********** products ***********/

app.get(
  "/products",
  asyncHandler(async (req, res) => {
    const { offset = 0, limit = 10, order = "newest", category } = req.query;
    let orderBy;
    switch (order) {
      case "priceLowest":
        orderBy = { price: "asc" };
        break;
      case "priceHighest":
        orderBy = { price: "desc" };
        break;
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
    }
    const where = category ? { category } : {};
    const products = await prisma.product.findMany({
      where,
      orderBy,
      skip: parseInt(offset),
      take: parseInt(limit),
    });
    res.send(products);
  })
);

app.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
    });
    res.send(product);
  })
);

app.post(
  "/products",
  asyncHandler(async (req, res) => {
    assert(req.body, CreateProduct);
    const product = await prisma.product.create({
      data: req.body,
    });
    res.status(201).send(product);
  })
);

app.patch(
  "/products/:id",
  asyncHandler(async (req, res) => {
    assert(req.body, PatchProduct);
    const { id } = req.params;
    const product = await prisma.product.update({
      where: { id },
      data: req.body,
    });
    res.send(product);
  })
);

app.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.product.delete({
      where: { id },
    });
    res.sendStatus(204);
  })
);

/*********** orders ***********/

app.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany();
    res.send(orders);
  })
);

app.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        orderItems: true,
      },
    });

    const total = order.orderItems.reduce(
      (acc, item) => acc + item.unitPrice * item.quantity,
      0
    );
    order.total = total;
    res.send({ order });
  })
);

app.post(
  "/orders",
  asyncHandler(async (req, res) => {
    assert(req.body, CreateOrder);
    const { userId, orderItems } = req.body;

    const productIds = orderItems.map((orderItem) => orderItem.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    function getQuantity(productId) {
      const orderItem = orderItems.find(
        (orderItem) => orderItem.productId === productId
      );
      return orderItem.quantity;
    }

    // 재고 확인
    const isSufficientStock = products.every((product) => {
      const { id, stock } = product;
      return stock >= getQuantity(id);
    });

    if (!isSufficientStock) {
      throw new Error("Insufficient Stock");
    }

    // order 생성하고 감소
    const queries = productIds.map((productId) =>
      prisma.product.update({
        where: { id: productId },
        data: { stock: { decrement: getQuantity(productId) } },
      })
    );

    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          userId,
          orderItems: {
            create: orderItems,
          },
        },
        include: {
          orderItems: true,
        },
      }),
      ...queries,
    ]);

    await prisma.$transaction();
    await Promise.all(queries);

    res.status(201).send(order);
  })
);

app.patch(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    assert(req.body, PatchOrder);
    const { id } = req.params;
    const order = await prisma.order.update({
      where: { id },
      data: req.body,
    });
    res.send(order);
  })
);

app.delete(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.order.delete({ where: { id } });
    res.sendStatus(204);
  })
);

app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
