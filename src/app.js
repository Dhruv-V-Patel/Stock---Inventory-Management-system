const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const app = express();

const authRoutes = require("./routes/authRoutes");
const dashRoutes = require("./routes/dashboardRoutes");
const productsRoutes = require("./routes/productsRoutes");
const productCategoriesRoutes = require("./routes/productCategoriesRoutes");
const rawMaterialsRoutes = require("./routes/rawMaterialsRoutes");
const productBomRoutes = require("./routes/productBomRoutes");
const rawMaterialStockRoutes = require("./routes/rawMaterialStockRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const productionRoutes = require("./routes/productionRoutes");
const finishedStockRoutes = require("./routes/finishedStockRoutes");
const salesRoutes = require("./routes/salesRoutes");
const customerRoutes = require("./routes/customerRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const userRoutes = require("./routes/userRoutes");
const stockReportRoutes = require("./routes/stockReportRoutes");
const productionReportRoutes = require("./routes/productionReportRoutes");
const purchaseReportRoutes = require("./routes/purchaseReportRoutes");
const saleReportRoutes = require("./routes/saleReportRoutes");
const paymentReportRoutes = require("./routes/paymentReportRoutes");
const authorizationRoutes = require("./routes/authorizationRoutes");
const purchaseReturnRoutes = require("./routes/purchaseReturnRoutes");
const salesReturnRoutes = require("./routes/salesReturnRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const openingStockRoutes = require("./routes/openingStockRoutes");
const pushRoutes = require("./routes/pushRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const expenseRoutes = require('./routes/expenseRoutes');

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// --------------------------------------------------
// Body Parsers
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --------------------------------------------------
// Health API
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  return res.json({
    success: true,
    message: "RCC Stock Management API is running",
  });
});

app.use("/api/push", pushRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/product-categories",productCategoriesRoutes);
app.use("/api/raw-materials", rawMaterialsRoutes);
app.use("/api/product-boms",productBomRoutes);
app.use("/api/raw-material-stock", rawMaterialStockRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/finished-stock", finishedStockRoutes);
app.use("/api/sales", salesRoutes);   
app.use("/api/customers", customerRoutes);
app.use("/api/dispatches", dispatchRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stock-report", stockReportRoutes);
app.use("/api/production-report", productionReportRoutes);
app.use("/api/purchase-report", purchaseReportRoutes);
app.use("/api/sale-report", saleReportRoutes);
app.use("/api/reports/payments", paymentReportRoutes);
app.use("/api/authorizations",authorizationRoutes);
app.use("/api/purchase-returns",purchaseReturnRoutes);
app.use("/api/sales-returns",salesReturnRoutes);
app.use("/api/audit-logs",auditLogRoutes);
app.use("/api/opening-stock", openingStockRoutes);
app.use('/api/expenses', expenseRoutes);

app.set("trust proxy", 1);
app.get("/:page", (req, res, next) => {
  const filePath = path.join(
    __dirname,
    "../",
    "public",
    `${req.params.page}.html`,
  );

  if (!fs.existsSync(filePath)) {
    return next();
  }

  res.sendFile(filePath);
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../", "public", "404.html"));
});

// --------------------------------------------------
// Global Error Handler
// --------------------------------------------------

app.use((error, req, res, next) => {
  console.error("[Express Error]", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

module.exports = app;
