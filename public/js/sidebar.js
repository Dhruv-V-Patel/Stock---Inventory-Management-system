const loadSidebar = async (activePage = "") => {
  try {
    const container = document.getElementById("sidebar-container");

    if (!container) {
      return;
    }

    const response = await fetch("/components/sidebar.html");

    if (!response.ok) {
      throw new Error(`Failed to load sidebar: ${response.status}`);
    }

    container.innerHTML = await response.text();

    setActiveSidebarPage(activePage);

    initializeSidebar();

    initializeTheme();

    initializeLogout();

    loadSidebarUser();
  } catch (error) {
    // console.error("Sidebar loading error:", error);
  }
};

// const setActiveSidebarPage = (activePage) => {
//   const navItems = document.querySelectorAll(".sidebar .nav-item");

//   navItems.forEach((item) => {
//     const page = item.dataset.page;

//     item.classList.toggle("active", page === activePage);
//   });
// };

const setActiveSidebarPage = (activePage) => {
  // Remove all active states first
  document
    .querySelectorAll(".sidebar .nav-item, .sidebar .submenu-item")
    .forEach((item) => {
      item.classList.remove("active");
    });

  // Close all submenus first
  document.querySelectorAll(".sidebar .settings-submenu").forEach((submenu) => {
    submenu.classList.remove("open");
  });

  document.querySelectorAll(".sidebar .settings-arrow").forEach((arrow) => {
    arrow.classList.remove("rotate");
  });

  if (!activePage) {
    return;
  }

  // Find selected submenu item
  const activeSubmenuItem = document.querySelector(
    `.sidebar .submenu-item[data-page="${activePage}"]`
  );

  if (activeSubmenuItem) {
    // Make submenu item selected
    activeSubmenuItem.classList.add("active");

    // Find its parent settings menu
    const settingsMenu = activeSubmenuItem.closest(".settings-menu");

    if (settingsMenu) {
      // Open parent submenu
      const submenu = settingsMenu.querySelector(".settings-submenu");

      if (submenu) {
        submenu.classList.add("open");
      }

      // Rotate parent arrow
      const arrow = settingsMenu.querySelector(".settings-arrow");

      if (arrow) {
        arrow.classList.add("rotate");
      }

      // Highlight parent menu
      const toggle = settingsMenu.querySelector(".settings-toggle");

      if (toggle) {
        toggle.classList.add("active");
      }
    }

    return;
  }

  // Normal top-level menu item
  const activeNavItem = document.querySelector(
    `.sidebar .nav-item[data-page="${activePage}"]`
  );

  if (activeNavItem) {
    activeNavItem.classList.add("active");
  }
};

const initializeSidebar = () => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  // const mobileToggle = document.getElementById("mobileToggle");

  const masterToggle = document.getElementById("masterToggle");
  const masterSubmenu = document.getElementById("masterSubmenu");
  const masterArrow = document.getElementById("masterArrow");
  
  const inventoryToggle = document.getElementById("inventoryToggle");
  const inventorySubmenu = document.getElementById("inventorySubmenu");
  const inventoryArrow = document.getElementById("inventoryArrow");
  
  const purchaseToggle = document.getElementById("purchaseToggle");
  const purchaseSubmenu = document.getElementById("purchaseSubmenu");
  const purchaseArrow = document.getElementById("purchaseArrow");

  const productionToggle = document.getElementById("productionToggle");
  const productionSubmenu = document.getElementById("productionSubmenu");
  const productionArrow = document.getElementById("productionArrow");

  const salesToggle = document.getElementById("salesToggle");
  const salesSubmenu = document.getElementById("salesSubmenu");
  const salesArrow = document.getElementById("salesArrow");

  const reportsToggle = document.getElementById("reportsToggle");
  const reportsSubmenu = document.getElementById("reportsSubmenu");
  const reportsArrow = document.getElementById("reportsArrow");

  const settingsToggle = document.getElementById("settingsToggle");
  const settingsSubmenu = document.getElementById("settingsSubmenu");
  const settingsArrow = document.getElementById("settingsArrow");

  const openSidebar = () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
    document.body.classList.add("sidebar-open");
  };

  const closeSidebar = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
    document.body.classList.remove("sidebar-open");
  };

  // mobileToggle?.addEventListener("click", openSidebar);

  overlay?.addEventListener("click", closeSidebar);

  // Master submenu toggle
  masterToggle?.addEventListener("click", () => {
    const isOpen = masterSubmenu?.classList.toggle("open");
    masterArrow?.classList.toggle("rotate", isOpen);
  });

  // inventory submenu toggle
  inventoryToggle?.addEventListener("click", () => {
    const isOpen = inventorySubmenu?.classList.toggle("open");
    inventoryArrow?.classList.toggle("rotate", isOpen);
  });

  // purchase submenu toggle
  purchaseToggle?.addEventListener("click", () => {
    const isOpen = purchaseSubmenu?.classList.toggle("open");
    purchaseArrow?.classList.toggle("rotate", isOpen);
  });

  // production submenu toggle
  productionToggle?.addEventListener("click", () => {
    const isOpen = productionSubmenu?.classList.toggle("open");
    productionArrow?.classList.toggle("rotate", isOpen);
  });

  // sales submenu toggle
  salesToggle?.addEventListener("click", () => {
    const isOpen = salesSubmenu?.classList.toggle("open");
    salesArrow?.classList.toggle("rotate", isOpen);
  });

  // reports submenu toggle
  reportsToggle?.addEventListener("click", () => {
    const isOpen = reportsSubmenu?.classList.toggle("open");
    reportsArrow?.classList.toggle("rotate", isOpen);
  });

  // Settings submenu toggle
  settingsToggle?.addEventListener("click", () => {
    const isOpen = settingsSubmenu?.classList.toggle("open");

    // settingsToggle.classList.toggle("active", isOpen);
    settingsArrow?.classList.toggle("rotate", isOpen);
  });

  document.querySelectorAll(".sidebar .nav-item:not(.settings-toggle), .sidebar .submenu-item",)
    .forEach((item) => {
      item.addEventListener("click", closeSidebar);
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });
};

const initializeTheme = () => {
  const themeToggle = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const savedTheme = localStorage.getItem("theme") || "light";

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);

    localStorage.setItem("theme", theme);

    if (theme === "dark") {
      themeIcon?.classList.remove("fa-moon");
      themeIcon?.classList.add("fa-sun");

      themeToggle?.setAttribute("title", "Switch to light mode");
    } else {
      themeIcon?.classList.remove("fa-sun");
      themeIcon?.classList.add("fa-moon");

      themeToggle?.setAttribute("title", "Switch to dark mode");
    }
  };

  applyTheme(savedTheme);

  themeToggle?.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");

    const newTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(newTheme);
  });
};

const loadSidebarUser = () => {
  try {
    const storedUser = localStorage.getItem("user");

    const user = JSON.parse(storedUser);

    const userName = document.getElementById("sidebarUserName");

    const userRole = document.getElementById("sidebarUserRole");

    const userAvatar = document.getElementById("sidebarUserAvatar");

    const adminMenu = document.getElementById("adminMenu");

    if (userName) {
      userName.textContent = user.name || "User";
    }

    if (userRole) {
      userRole.textContent = formatRole(user.role);
    }

    if (userAvatar) {
      const initials = (user.name || "User")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      userAvatar.textContent =
        initials.length > 1
          ? `${initials[0][0]}${initials[initials.length - 1][0]}`.toUpperCase()
          : initials[0][0].toUpperCase();
    }
    // Admin-only sidebar section
    if (adminMenu && user.role !== "admin") {
      adminMenu.style.display = "none";
    }
  } catch (error) {
    // console.error("Failed to load sidebar user:", error);
  }
};

const initializeLogout = () => {
  const logoutButton = document.getElementById("logoutButton");

  logoutButton?.addEventListener("click", () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");

    window.location.href = "/login";
  });
};

const formatRole = (role) => {
  if (!role) {
    return "";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};
