let productionChart = null;


/* ========================================
   HELPERS
======================================== */

const $ = (selector) => {
  return document.querySelector(selector);
};


const formatNumber = (value) => {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
};


const formatCurrency = (value) => {
  const amount = Number(value || 0);

  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }

  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} Lakh`;
  }

  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }

  return `₹${amount.toLocaleString("en-IN")}`;
};


const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};


const formatTime = (date) => {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};


/* ========================================
   TODAY
======================================== */

const setToday = () => {

  const element = $("#today");

  if (!element) {
    return;
  }

  element.textContent =
    new Date().toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
};


/* ========================================
   API
======================================== */

const fetchDashboard = async () => {

  const token = localStorage.getItem("accessToken");

  if (!token) {
    window.location.replace("/login");
    return null;
  }

  const response = await fetch("/api/dashboard", {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });


  if (response.status === 401) {

    localStorage.removeItem("accessToken");

    window.location.replace("/login");

    return null;
  }


  if (!response.ok) {

    throw new Error(
      `Dashboard API failed: ${response.status}`
    );
  }


  const result = await response.json();


  if (!result.success) {

    throw new Error(
      result.message || "Failed to load dashboard"
    );
  }


  return result.data;
};


/* ========================================
   KPI
======================================== */

const renderSummary = (summary) => {
  $("#rawMaterialItems").textContent =` ${formatNumber(summary.rawMaterialItems)} Items`;
  $("#todayProduction").textContent =`${formatNumber(summary.todayProduction)} Units`;
  $("#finishedStock").textContent = `${formatNumber(summary.finishedStock)} Units`;
  $("#lowStockItems").textContent = `${formatNumber(summary.lowStockItems)} Items`;
  $("#todaySales").textContent = formatCurrency(summary.todaySales);
  $("#productionEfficiency").textContent = `${Number(summary.productionEfficiency || 0).toFixed(2)}%`;
};


/* ========================================
   FINISHED STOCK
======================================== */

const renderFinishedStock = (items) => {
  const container = $("#finishedStockList");

  if (!container) {
    return;
  }


  if (!items?.length) {

    container.innerHTML = `
      <div class="dashboard-empty">
        <i class="fa-solid fa-box-open"></i>
        <span>No finished stock available</span>
      </div>
    `;
    return;
  }


  container.innerHTML = items
    .map(
      (item) => `
        <div class="stock-row">

          <div class="item-icon">
            <i class="fa-solid fa-cube"></i>
          </div>

          <div class="item-info">

            <strong>
              ${item.name}
            </strong>

            <span>
              ${item.code || "Product"} · Ready stock
            </span>
          </div>

          <strong class="quantity">
            ${formatNumber(item.quantity)}
            ${item.unit || ""}
          </strong>
        </div>
      `
    )
    .join("");
};


/* ========================================
   MATERIAL CONSUMPTION
======================================== */

const renderMaterialConsumption = (items) => {

  const container =
    $("#materialConsumptionList");

  if (!container) {
    return;
  }

  if (!items?.length) {

    container.innerHTML = `
      <div class="dashboard-empty">
        <i class="fa-solid fa-boxes-stacked"></i>
        <span>No material consumed today</span>
      </div>
    `;

    return;
  }

  const maxQuantity = Math.max(
    ...items.map(
      (item) => Number(item.quantity || 0)
    ),
    1
  );

  container.innerHTML = items
    .map((item) => {

      const percentage = Math.min(
        100,
        Math.round(
          (Number(item.quantity || 0) /
            maxQuantity) *
            100
        )
      );

      return `
        <div class="material-row">

          <div>
            <strong>
              ${item.name}
            </strong>

            <span>
              ${formatNumber(item.quantity)}
              ${item.unit || ""}
            </span>
          </div>

          <div class="progress">
            <i style="width:${percentage}%"></i>
          </div>

          <b>${percentage}%</b>
        </div>
      `;
    })
    .join("");
};

/* ========================================
   LOW STOCK
======================================== */

const renderLowStock = (items) => {
  const container = $("#lowStockList");

  if (!container) {
    return;
  }

  if (!items?.length) {

    container.innerHTML = `
      <div class="dashboard-empty success">
        <i class="fa-solid fa-circle-check"></i>
        <span>All stock levels are healthy</span>
      </div>
    `;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="low-row">
          <span class="status-dot"></span>
          <div>

            <strong>
              ${item.name}
            </strong>

            <small>
              Current
              ${formatNumber(item.currentStock)}
              ${item.unit || ""} · Minimum
              ${formatNumber(item.minimumStock)}
              ${item.unit || ""}
            </small>
          </div>
          <b>Low</b>
        </div>
      `
    )
    .join("");
};


/* ========================================
   RECENT PRODUCTION
======================================== */

const renderRecentProduction = (items) => {

  const container =
    $("#recentProductionList");

  if (!container) {
    return;
  }


  if (!items?.length) {

    container.innerHTML = `
      <div class="dashboard-empty">
        <i class="fa-solid fa-industry"></i>
        <span>No production records found</span>
      </div>
    `;

    return;
  }


  container.innerHTML = items
    .map(
      (item) => `
        <div class="production-row">
          <div class="round-icon">
            <i class="fa-solid fa-industry"></i>
          </div>
          <div>
            <strong>
              ${item.productName}
            </strong>

            <small>
              Batch ${item.batchNo}
              ·
              ${formatTime(item.createdAt)}
            </small>
          </div>
          <b>
            +${formatNumber(item.producedQuantity)}
            ${item.unit || "Units"}
          </b>
        </div>
      `
    )
    .join("");
};


/* ========================================
   CHART
======================================== */

const renderProductionChart = (items) => {

  const canvas =$("#productionChart");

  if (!canvas) {
    return;
  }
  const labels = items.map((item) => formatDate(item.date));
  const production =items.map((item) => Number(item.production || 0));
  const sales =items.map((item) => Number(item.sales || 0));

  if (productionChart) {
    productionChart.destroy();
  }


  productionChart = new Chart(
    canvas,
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Production",
            data: production,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
          },
          {
            label: "Sales",
            data: sales,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
          },

        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },

        plugins: {
          legend: {
            position: "top",
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.dataset.label}: ${formatNumber(
                  context.raw
                )}`;
              },
            },
          },
        },

        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
      },
    }
  );
};

/* ========================================
   RENDER
======================================== */

const renderDashboard = (data) => {

  renderSummary(data.summary);
  renderProductionChart(data.productionVsSales);
  renderFinishedStock(data.finishedStock);
  renderMaterialConsumption(data.materialConsumption);
  renderLowStock(data.lowStockItems);
  renderRecentProduction(data.recentProduction);
  initializeProductionSalesPeriod();
};


/* ========================================
   LOADING STATE
======================================== */

const setDashboardLoading = (loading) => {

  document
    .querySelectorAll(".kpi-card strong")
    .forEach((element) => {

      if (loading) {
        element.classList.add(
          "dashboard-value-loading"
        );
      } else {
        element.classList.remove(
          "dashboard-value-loading"
        );
      }

    });
};

const updateProductionSalesChart = async (days) => {
  try {
    const data = await fetchProductionVsSales(days);

    renderProductionChart(data);
  } catch (error) {
    console.error(
      "[Production vs Sales]",
      error
    );
  }
};

const initializeProductionSalesPeriod = () => {
  const select = $("#productionSalesPeriod");

  if (!select) {
    return;
  }

  select.addEventListener("change", async (event) => {
    const days = Number(event.target.value);

    await updateProductionSalesChart(days);
  });
};

const fetchProductionVsSales = async (days) => {
  const token = localStorage.getItem("accessToken");

  if (!token) {
    window.location.replace("/login");
    return [];
  }

  const response = await fetch(
    `/api/dashboard/production-vs-sales?days=${days}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (response.status === 401) {
    localStorage.removeItem("accessToken");
    window.location.replace("/login");
    return [];
  }

  if (!response.ok) {
    throw new Error(
      `Production vs Sales API failed: ${response.status}`
    );
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.message || "Failed to load production vs sales"
    );
  }

  return result.data;
};


/* ========================================
   INIT
======================================== */

const initializeDashboard = async () => {

  try {

    setToday();
    setDashboardLoading(true);

    const data = await fetchDashboard();

    if (!data) {
      return;
    }

    renderDashboard(data);
  } catch (error) {
    console.error("[Dashboard]",error);

    const containers = [
      "#finishedStockList",
      "#materialConsumptionList",
      "#lowStockList",
      "#recentProductionList",
    ];
    containers.forEach((selector) => {

      const element = $(selector);

      if (!element) {
        return;
      }
      element.innerHTML = `
        <div class="dashboard-error">
          <i class="fa-solid fa-circle-exclamation"></i>

          <span>
            Failed to load dashboard data
          </span>

          <button
            type="button"
            onclick="initializeDashboard()"
          >
            Retry
          </button>
        </div>
      `;

    });

  } finally {

    setDashboardLoading(false);

  }
};


document.addEventListener(
  "DOMContentLoaded",
  initializeDashboard
);