CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    mobile VARCHAR(15) UNIQUE,
    password_hash TEXT NOT NULL,

    role VARCHAR(50) NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin', 'member')),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    reset_code VARCHAR(6),
    reset_code_expiry TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE IF NOT EXISTS product_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_product_categories_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category_id BIGINT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
    size VARCHAR(100),
    unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
    minimum_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
    selling_rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
    gst_tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE products
ADD CONSTRAINT products_gst_tax_rate_check
CHECK (
  gst_tax_rate >= 0
  AND gst_tax_rate <= 100
);


CREATE TABLE IF NOT EXISTS raw_materials (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    unit VARCHAR(20) NOT NULL,
    minimum_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    mobile VARCHAR(20),
    gstin VARCHAR(20),
    address TEXT,
    payment_terms VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    mobile VARCHAR(20),
    gstin VARCHAR(20),
    address TEXT,
    payment_terms VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_boms (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, name)
);

CREATE TABLE IF NOT EXISTS product_bom_items (
    id BIGSERIAL PRIMARY KEY,
    bom_id BIGINT NOT NULL REFERENCES product_boms(id) ON DELETE CASCADE,
    raw_material_id BIGINT NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    UNIQUE(bom_id, raw_material_id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id BIGSERIAL PRIMARY KEY,
    purchase_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    invoice_no VARCHAR(100),
    invoice_date TIMESTAMP WITHOUT TIME ZONE,
    vehicle_no VARCHAR(30),
    driver_name VARCHAR(150),
    driver_mobile VARCHAR(20),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    freight_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            payment_status IN (
                'PENDING',
                'PARTIAL',
                'PAID'
            )
        ),
    remarks TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    raw_material_id BIGINT NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    rate NUMERIC(14, 2) NOT NULL CHECK (rate >= 0),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_returns (
    id BIGSERIAL PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_id BIGINT REFERENCES purchases(id) ON DELETE SET NULL,
    return_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_return_id BIGINT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    raw_material_id BIGINT NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reason VARCHAR(100),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_no VARCHAR(50) UNIQUE NOT NULL,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    production_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bom_id BIGINT NOT NULL REFERENCES product_boms(id) ON DELETE RESTRICT,
    planned_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
    produced_quantity NUMERIC(14, 3) NOT NULL CHECK (produced_quantity > 0),
    wastage_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
    shift VARCHAR(50),
    machine VARCHAR(100),
    supervisor VARCHAR(150),
    remarks TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_materials (
    id BIGSERIAL PRIMARY KEY,
    production_batch_id BIGINT NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    raw_material_id BIGINT NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
    standard_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
    actual_quantity NUMERIC(14, 3) NOT NULL CHECK (actual_quantity > 0),
    unit VARCHAR(20) NOT NULL,
    variance_quantity NUMERIC(14, 3) GENERATED ALWAYS AS (actual_quantity - standard_quantity) STORED,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_wastage (
    id BIGSERIAL PRIMARY KEY,
    production_batch_id BIGINT NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    reason VARCHAR(100) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- CREATE TABLE IF NOT EXISTS curing_batches (
--     id BIGSERIAL PRIMARY KEY,
--     curing_no VARCHAR(50) UNIQUE NOT NULL,
--     production_batch_id BIGINT NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
--     product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
--     quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
--     curing_start_date DATE NOT NULL,
--     expected_ready_date DATE NOT NULL,
--     completed_date DATE,
--     status VARCHAR(20) NOT NULL DEFAULT 'IN_CURING'
--         CHECK (
--             status IN (
--                 'IN_CURING',
--                 'COMPLETED'
--             )
--         ),
--     damaged_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
--     remarks TEXT,
--     created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
--     created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
-- );

CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGSERIAL PRIMARY KEY,
    item_type VARCHAR(30) NOT NULL
        CHECK (
            item_type IN (
                'RAW_MATERIAL',
                'PRODUCT'
            )
        ),
    item_id BIGINT NOT NULL,
    direction VARCHAR(10) NOT NULL
        CHECK (
            direction IN (
                'IN',
                'OUT'
            )
        ),
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    movement_type VARCHAR(50) NOT NULL,
    reference_type VARCHAR(50),
    reference_id BIGINT,
    movement_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    remarks TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id BIGSERIAL PRIMARY KEY,
    sale_no VARCHAR(50) UNIQUE NOT NULL,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vehicle_no VARCHAR(30),
    driver_name VARCHAR(150),
    driver_mobile VARCHAR(20),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
    challan_lr_no VARCHAR(100),
    discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    round_off NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            payment_status IN (
                'PENDING',
                'PARTIAL',  -- not pay full amount
                'PAID'
            )
        ),
    remarks TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
    id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    rate NUMERIC(14, 2) NOT NULL CHECK (rate >= 0),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_returns (
    id BIGSERIAL PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE NOT NULL,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
    return_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id BIGSERIAL PRIMARY KEY,
    sales_return_id BIGINT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reason VARCHAR(100),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispatches (
    id BIGSERIAL PRIMARY KEY,
    dispatch_no VARCHAR(50) UNIQUE NOT NULL,
    sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    dispatch_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vehicle_no VARCHAR(30),
    driver_name VARCHAR(150),
    driver_mobile VARCHAR(20),
    challan_no VARCHAR(100),
    remarks TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispatch_items (
    id BIGSERIAL PRIMARY KEY,
    dispatch_id BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_bills (
  id BIGSERIAL PRIMARY KEY,
  expense_no VARCHAR(50) UNIQUE NOT NULL,
  category_id BIGINT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  vendor_name VARCHAR(200),
  bill_number VARCHAR(100),
  bill_date DATE NOT NULL,
  due_date DATE,
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING','PARTIAL','PAID')),
  remarks TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    payment_no VARCHAR(50) UNIQUE NOT NULL,
    payment_type VARCHAR(20) NOT NULL
        CHECK (
            payment_type IN (
                'CUSTOMER',
                'SUPPLIER'
            )
        ),
    customer_id BIGINT REFERENCES customers(id) ON DELETE RESTRICT,
    supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
    sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
    purchase_id BIGINT REFERENCES purchases(id) ON DELETE SET NULL,
    payment_date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'INVOICE',
    expense_bill_id BIGINT REFERENCES expense_bills(id) ON DELETE SET NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    expense_category_id BIGINT,
    paid_to VARCHAR(200),
    payment_method VARCHAR(30),
    reference_no VARCHAR(100),
    remarks TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_payment_reference
    CHECK (
        (
            payment_type = 'CUSTOMER'
            AND customer_id IS NOT NULL
            AND supplier_id IS NULL
            AND sale_id IS NOT NULL
            AND purchase_id IS NULL
        )
        OR
        (
            payment_type = 'SUPPLIER'
            AND supplier_id IS NOT NULL
            AND customer_id IS NULL
            AND purchase_id IS NOT NULL
            AND sale_id IS NULL
        )
        OR
        (
            payment_type = 'EXPENSE'
            AND customer_id IS NULL
            AND supplier_id IS NULL
            AND sale_id IS NULL
            AND purchase_id IS NULL
            AND expense_category_id IS NOT NULL
        )
    ),
    CONSTRAINT payments_payment_mode_check CHECK (payment_mode IN ('INVOICE', 'ADVANCE', 'QUICK')),
    CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('CUSTOMER','SUPPLIER','EXPENSE'))
);

CREATE TABLE IF NOT EXISTS payment_allocations (
    id BIGSERIAL PRIMARY KEY,

    payment_id BIGINT NOT NULL
        REFERENCES payments(id)
        ON DELETE CASCADE,

    sale_id BIGINT
        REFERENCES sales(id)
        ON DELETE CASCADE,

    purchase_id BIGINT
        REFERENCES purchases(id)
        ON DELETE CASCADE,

    allocated_amount NUMERIC(15,2) NOT NULL
        CHECK (allocated_amount > 0),

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT payment_allocation_document_check
    CHECK (
        (sale_id IS NOT NULL AND purchase_id IS NULL)
        OR
        (sale_id IS NULL AND purchase_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    module VARCHAR(50) NOT NULL,
    record_id BIGINT,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE INDEX IF NOT EXISTS idx_raw_materials_name ON raw_materials(name);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);

CREATE INDEX IF NOT EXISTS idx_production_product ON production_batches(product_id);

CREATE INDEX IF NOT EXISTS idx_production_date ON production_batches(production_date);

-- CREATE INDEX IF NOT EXISTS idx_curing_status ON curing_batches(status);

-- CREATE INDEX IF NOT EXISTS idx_curing_expected_ready ON curing_batches(expected_ready_date);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date);

CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

CREATE INDEX IF NOT EXISTS idx_dispatches_customer ON dispatches(customer_id);

CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(dispatch_date);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_supplier ON payments(supplier_id);


CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_gstin
ON suppliers (UPPER(TRIM(gstin)))
WHERE gstin IS NOT NULL
  AND TRIM(gstin) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_name_normalized
ON suppliers (LOWER(TRIM(name)));


CREATE TABLE IF NOT EXISTS opening_stock (
    id BIGSERIAL PRIMARY KEY,

    item_type VARCHAR(30) NOT NULL
        CHECK (item_type IN ('RAW_MATERIAL', 'PRODUCT')),

    item_id BIGINT NOT NULL,

    opening_date DATE NOT NULL,

    quantity NUMERIC(14, 3) NOT NULL DEFAULT 0
        CHECK (quantity >= 0),

    rate NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (rate >= 0),

    remarks TEXT,

    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_opening_stock_item
        UNIQUE (item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_opening_stock_date
    ON opening_stock(opening_date);

CREATE INDEX IF NOT EXISTS idx_opening_stock_item
    ON opening_stock(item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_opening_stock
    ON stock_movements(reference_type, reference_id)
    WHERE reference_type = 'OPENING_STOCK';

-- CREATE TABLE IF NOT EXISTS vehicles (
--     id BIGSERIAL PRIMARY KEY,
--     vehicle_number VARCHAR(30) UNIQUE NOT NULL,
--     vehicle_type VARCHAR(50),
--     owner_name VARCHAR(150),
--     capacity NUMERIC(14, 3),
--     capacity_unit VARCHAR(20),
--     is_active BOOLEAN NOT NULL DEFAULT TRUE,
--     created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS drivers (
--     id BIGSERIAL PRIMARY KEY,
--     name VARCHAR(150) NOT NULL,
--     mobile VARCHAR(20),
--     license_number VARCHAR(50),
--     is_active BOOLEAN NOT NULL DEFAULT TRUE,
--     created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
-- );


CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id BIGSERIAL PRIMARY KEY,
    module VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_permissions_module_action
        UNIQUE (module, action)
);


CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGSERIAL PRIMARY KEY,

    role_id BIGINT NOT NULL
        REFERENCES roles(id)
        ON DELETE CASCADE,

    permission_id BIGINT NOT NULL
        REFERENCES permissions(id)
        ON DELETE CASCADE,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_role_permission
        UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    permission_id BIGINT NOT NULL
        REFERENCES permissions(id)
        ON DELETE CASCADE,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_permission
        UNIQUE (user_id, permission_id)
);

INSERT INTO roles (name, description)
VALUES
    ('admin', 'Full system access'),
    ('member', 'Standard system access')
ON CONFLICT (name) DO NOTHING;


INSERT INTO permissions (module, action, name, description) VALUES

-- Dashboard
('dashboard', 'view', 'View Dashboard', 'View dashboard'),

-- Master
('products', 'view', 'View Products', 'View products'),
('products', 'add', 'Add Products', 'Create new products'),
('products', 'edit', 'Edit Products', 'Update products'),
('products', 'delete', 'Delete Products', 'Delete products'),

('raw-materials', 'view', 'View Raw Materials', 'View raw materials'),
('raw-materials', 'add', 'Add Raw Materials', 'Create new raw materials'),
('raw-materials', 'edit', 'Edit Raw Materials', 'Update raw materials'),
('raw-materials', 'delete', 'Delete Raw Materials', 'Delete raw materials'),

('customers', 'view', 'View Customers', 'View customers'),
('customers', 'add', 'Add Customers', 'Create new customers'),
('customers', 'edit', 'Edit Customers', 'Update customers'),
('customers', 'delete', 'Delete Customers', 'Delete customers'),

('suppliers', 'view', 'View Suppliers', 'View suppliers'),
('suppliers', 'add', 'Add Suppliers', 'Create new suppliers'),
('suppliers', 'edit', 'Edit Suppliers', 'Update suppliers'),
('suppliers', 'delete', 'Delete Suppliers', 'Delete suppliers'),

('product-bom', 'view', 'View Product Mix Design', 'View product mix design'),
('product-bom', 'add', 'Add Product Mix Design', 'Create new product mix design'),
('product-bom', 'edit', 'Edit Product Mix Design', 'Update product mix design'),
('product-bom', 'delete', 'Delete Product Mix Design', 'Delete product mix design'),

-- Inventory
('raw-material-stock', 'view', 'View Raw Material Stock', 'View raw material stock'),
('raw-material-stock', 'add', 'Add Raw Material Stock', 'Add raw material stock'),
('raw-material-stock', 'edit', 'Edit Raw Material Stock', 'Update raw material stock'),
('raw-material-stock', 'delete', 'Delete Raw Material Stock', 'Delete raw material stock'),

('ready-stock', 'view', 'View Ready Stock', 'View ready stock'),
('ready-stock', 'add', 'Add Ready Stock', 'Add ready stock'),
('ready-stock', 'edit', 'Edit Ready Stock', 'Update ready stock'),
('ready-stock', 'delete', 'Delete Ready Stock', 'Delete ready stock'),

('opening-stock', 'view', 'View Opening Stock', 'View opening stock'),
('opening-stock', 'add', 'Add Opening Stock', 'Create opening stock'),
('opening-stock', 'edit', 'Edit Opening Stock', 'Update opening stock'),
('opening-stock', 'delete', 'Delete Opening Stock', 'Delete opening stock'),

-- Purchase
('purchases', 'view', 'View Purchase', 'View purchases'),
('purchases', 'add', 'Add Purchase', 'Create new purchases'),
('purchases', 'edit', 'Edit Purchase', 'Update purchases'),
('purchases', 'delete', 'Delete Purchase', 'Delete purchases'),

('purchase-returns', 'view', 'View Purchase Returns', 'View purchase returns'),
('purchase-returns', 'add', 'Add Purchase Returns', 'Create new purchase returns'),
('purchase-returns', 'edit', 'Edit Purchase Returns', 'Update purchase returns'),
('purchase-returns', 'delete', 'Delete Purchase Returns', 'Delete purchase returns'),

-- Production
('production', 'view', 'View Daily Production', 'View daily production'),
('production', 'add', 'Add Daily Production', 'Create new daily production'),
('production', 'edit', 'Edit Daily Production', 'Update daily production'),
('production', 'delete', 'Delete Daily Production', 'Delete daily production'),

('production-wastage', 'view', 'View Production Wastage', 'View production wastage'),
('production-wastage', 'add', 'Add Production Wastage', 'Create new production wastage'),
('production-wastage', 'edit', 'Edit Production Wastage', 'Update production wastage'),
('production-wastage', 'delete', 'Delete Production Wastage', 'Delete production wastage'),

-- Sales
('sales', 'view', 'View Sales', 'View sales'),
('sales', 'add', 'Add Sales', 'Create new sales'),
('sales', 'edit', 'Edit Sales', 'Update sales'),
('sales', 'delete', 'Delete Sales', 'Delete sales'),

('sales-returns', 'view', 'View Sales Returns', 'View sales returns'),
('sales-returns', 'add', 'Add Sales Returns', 'Create new sales returns'),
('sales-returns', 'edit', 'Edit Sales Returns', 'Update sales returns'),
('sales-returns', 'delete', 'Delete Sales Returns', 'Delete sales returns'),

('dispatch', 'view', 'View Dispatch', 'View dispatch'),
('dispatch', 'add', 'Add Dispatch', 'Create new dispatch'),
('dispatch', 'edit', 'Edit Dispatch', 'Update dispatch'),
('dispatch', 'delete', 'Delete Dispatch', 'Delete dispatch'),

-- Payments
('payments', 'view', 'View Payments', 'View payments'),
('payments', 'add', 'Add Payments', 'Create new payments'),
('payments', 'edit', 'Edit Payments', 'Update payments'),
('payments', 'delete', 'Delete Payments', 'Delete payments'),

-- Expense
('expense','view', 'View Expense','View expense categories, bills, payables and reports'),
('expense','add', 'Add Expense', 'Add expense categories and bills'),
('expense','edit', 'Edit Expense','Edit expense categories and bills'),
('expense','delete', 'Delete Expense', 'Delete expense categories and bills'),

-- Reports
('stock-report', 'view', 'View Stock Report', 'View stock report'),

('production-report', 'view', 'View Production Report', 'View production report'),

('purchase-report', 'view', 'View Purchase Report', 'View purchase report'),

('sales-report', 'view', 'View Sales Report', 'View sales report'),

('payments-report', 'view', 'View Payment Report', 'View payment report'),

('consumption-correction', 'view', 'View Consumption Corrections', 'View production consumption correction records'),
('consumption-correction', 'add', 'Apply Consumption Correction','Apply bulk production consumption stock corrections'),


-- Quotation
('quotations', 'view', 'View Quotations', 'View quotations'),
('quotations', 'add', 'Add Quotations', 'Create new quotations'),
('quotations', 'edit', 'Edit Quotations', 'Update quotations'),
('quotations', 'delete', 'Delete Quotations', 'Delete quotations')

-- Administration
('manage-users', 'view', 'View Manage Users', 'View users'),
('manage-users', 'add', 'Add Manage Users', 'Create new users'),
('manage-users', 'edit', 'Edit Manage Users', 'Update users'),
('manage-users', 'delete', 'Delete Manage Users', 'Delete users'),

('audit-logs', 'view', 'View Audit Logs', 'View audit logs')

ON CONFLICT (module, action) DO NOTHING;


INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;


INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
INNER JOIN permissions p
    ON p.action = 'view'
WHERE r.name = 'member'
ON CONFLICT (role_id, permission_id) DO NOTHING;


CREATE TABLE IF NOT EXISTS push_subscriptions
(
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    browser TEXT,
    device TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications
(
    id BIGSERIAL PRIMARY KEY,

    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,

    type VARCHAR(50) NOT NULL,

    reference_type VARCHAR(50),
    reference_id INTEGER,

    created_by INTEGER REFERENCES users(id),

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads
(
    notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
ON notification_reads(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
ON push_subscriptions(user_id);



-- Expense Payment support for existing payments module

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_expense_category_fk'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_expense_category_fk
      FOREIGN KEY (expense_category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS expense_payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  expense_bill_id BIGINT NOT NULL REFERENCES expense_bills(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(payment_id, expense_bill_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_expense_category ON payments(expense_category_id);
CREATE INDEX IF NOT EXISTS idx_payments_expense_bill ON payments(expense_bill_id);
CREATE INDEX IF NOT EXISTS idx_expense_bills_category ON expense_bills(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_bills_status ON expense_bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_expense_payment_allocations_bill ON expense_payment_allocations(expense_bill_id);

INSERT INTO expense_categories (name) VALUES
('Labour'),
('Electricity'),
('Transport'),
('Diesel / Fuel'),
('Repair & Maintenance'),
('Office Expense'),
('Salary'),
('Rent'),
('Telephone / Internet'),
('Bank Charges'),
('Other Expense')
ON CONFLICT (name) DO NOTHING;


-- ------production_consumption_corrections

CREATE TABLE IF NOT EXISTS production_consumption_corrections (
    id BIGSERIAL PRIMARY KEY,

    correction_no VARCHAR(50) UNIQUE NOT NULL,

    bom_id BIGINT NOT NULL
        REFERENCES product_boms(id) ON DELETE RESTRICT,

    raw_material_id BIGINT NOT NULL
        REFERENCES raw_materials(id) ON DELETE RESTRICT,

    old_quantity NUMERIC(14,3) NOT NULL,
    corrected_quantity NUMERIC(14,3) NOT NULL,

    difference_per_unit NUMERIC(14,3) NOT NULL,

    reason TEXT NOT NULL,

    total_batches INTEGER NOT NULL DEFAULT 0,
    total_adjustment_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,

    created_by BIGINT
        REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS production_consumption_correction_items (
    id BIGSERIAL PRIMARY KEY,

    correction_id BIGINT NOT NULL
        REFERENCES production_consumption_corrections(id)
        ON DELETE CASCADE,

    production_batch_id BIGINT NOT NULL
        REFERENCES production_batches(id) ON DELETE RESTRICT,

    production_material_id BIGINT NOT NULL
        REFERENCES production_materials(id) ON DELETE RESTRICT,

    produced_quantity NUMERIC(14,3) NOT NULL,

    old_quantity NUMERIC(14,3) NOT NULL,
    corrected_quantity NUMERIC(14,3) NOT NULL,
    adjustment_quantity NUMERIC(14,3) NOT NULL,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(correction_id, production_batch_id, production_material_id)
);



-- INSERT INTO permissions (
--     module,
--     action,
--     name,
--     description
-- )
-- SELECT
--     module,
--     'add',
--     REPLACE(name, 'Edit ', 'Add '),
--     CASE
--         WHEN module = 'raw-material-stock'
--             THEN 'Add raw material stock'
--         WHEN module = 'ready-stock'
--             THEN 'Add ready stock'
--         WHEN module = 'manage-users'
--             THEN 'Create new users'
--         ELSE
--             'Create new ' || REPLACE(module, '-', ' ')
--     END
-- FROM permissions
-- WHERE action = 'edit'
-- ON CONFLICT (module, action) DO NOTHING;



-- ============================================
-- QUOTATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS quotations (
    id BIGSERIAL PRIMARY KEY,

    quotation_no VARCHAR(50) NOT NULL UNIQUE,

    customer_id INTEGER NOT NULL
        REFERENCES customers(id)
        ON DELETE RESTRICT,

    quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,

    valid_until DATE,

    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0
        CHECK (subtotal >= 0),

    discount NUMERIC(15,2) NOT NULL DEFAULT 0
        CHECK (discount >= 0),

    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0
        CHECK (tax_amount >= 0),

    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0
        CHECK (total_amount >= 0),

    remarks TEXT,

    created_by INTEGER
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id BIGSERIAL PRIMARY KEY,

    quotation_id BIGINT NOT NULL
        REFERENCES quotations(id)
        ON DELETE CASCADE,

    product_id INTEGER NOT NULL
        REFERENCES products(id)
        ON DELETE RESTRICT,

    quantity NUMERIC(15,3) NOT NULL
        CHECK (quantity > 0),

    unit VARCHAR(30) NOT NULL,

    rate NUMERIC(15,2) NOT NULL
        CHECK (rate >= 0),

    gst_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (gst_tax_rate >= 0 AND gst_tax_rate <= 100),

    gst_amount NUMERIC(15,2) NOT NULL DEFAULT 0
        CHECK (gst_amount >= 0),

    amount NUMERIC(15,2) NOT NULL DEFAULT 0
        CHECK (amount >= 0),

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_terms (
    id SERIAL PRIMARY KEY,

    term_text TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_term_items (
    id BIGSERIAL PRIMARY KEY,

    quotation_id BIGINT NOT NULL
        REFERENCES quotations(id)
        ON DELETE CASCADE,

    term_id INTEGER
        REFERENCES quotation_terms(id)
        ON DELETE SET NULL,

    term_text TEXT NOT NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotations_customer
    ON quotations(customer_id);

CREATE INDEX IF NOT EXISTS idx_quotations_date
    ON quotations(quotation_date);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation
    ON quotation_items(quotation_id);

CREATE INDEX IF NOT EXISTS idx_quotation_items_product
    ON quotation_items(product_id);

CREATE INDEX IF NOT EXISTS idx_quotation_term_items_quotation
    ON quotation_term_items(quotation_id);

CREATE INDEX IF NOT EXISTS idx_quotation_terms_active
    ON quotation_terms(is_active);


-- ============================================
-- DEFAULT TERMS
-- ============================================

INSERT INTO quotation_terms (term_text, sort_order)
SELECT 'Prices are valid for 15 days.', 1
WHERE NOT EXISTS (
    SELECT 1
    FROM quotation_terms
    WHERE term_text = 'Prices are valid for 15 days.'
);

INSERT INTO quotation_terms (term_text, sort_order)
SELECT 'GST will be charged as applicable.', 2
WHERE NOT EXISTS (
    SELECT 1
    FROM quotation_terms
    WHERE term_text = 'GST will be charged as applicable.'
);

INSERT INTO quotation_terms (term_text, sort_order)
SELECT 'Delivery charges are extra.', 3
WHERE NOT EXISTS (
    SELECT 1
    FROM quotation_terms
    WHERE term_text = 'Delivery charges are extra.'
);

CREATE TABLE IF NOT EXISTS company_settings (
    id BIGSERIAL PRIMARY KEY,

    company_name VARCHAR(150) NOT NULL,
    tagline VARCHAR(255),

    address TEXT,
    gstin VARCHAR(20),

    phone VARCHAR(20),
    email VARCHAR(150),
    website VARCHAR(255),

    logo_url TEXT,
    stamp_url TEXT,

    authorized_signatory_name VARCHAR(100),

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_company_settings_single
ON company_settings ((TRUE));

INSERT INTO permissions (module, action, name, description) VALUES

-- Quotation
('quotations', 'view', 'View Quotations', 'View quotations'),
('quotations', 'add', 'Add Quotations', 'Create new quotations'),
('quotations', 'edit', 'Edit Quotations', 'Update quotations'),
('quotations', 'delete', 'Delete Quotations', 'Delete quotations')

ON CONFLICT (module, action) DO NOTHING;