
const loadHeader = async ({ title = "", description = "" } = {}) => {
  try {
    const container = document.getElementById("header-container");

    if (!container) {
      return;
    }

    const response = await fetch("/components/header.html");

    if (!response.ok) {
      throw new Error(`Failed to load header: ${response.status}`);
    }

    container.innerHTML = await response.text();

    setHeaderContent(title, description);

    loadHeaderUser();

    initializeHeaderMenu();
    initializeNotifications();
  } catch (error) {
    // console.error("Header loading error:", error);
  }
};

const setHeaderContent = (title, description) => {
  const pageTitle = document.getElementById("pageTitle");

  const pageDescription = document.getElementById("pageDescription");

  if (pageTitle) {
    pageTitle.textContent = title;
  }

  if (pageDescription) {
    pageDescription.textContent = description;
  }
};

const loadHeaderUser = () => {
  try {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      return;
    }

    const user = JSON.parse(storedUser);

    const userName = document.getElementById("headerUserName");

    const userRole = document.getElementById("headerUserRole");

    const userAvatar = document.getElementById("headerUserAvatar");

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
  } catch (error) {
    // console.error("Failed to load header user:", error);
  }
};


const initializeHeaderMenu = () => {
  const button = document.getElementById("headerMenuButton");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    // Get sidebar at CLICK TIME,
    // not when header is initialized
    const sidebar = document.getElementById("sidebar");

    const overlay = document.getElementById("sidebarOverlay");

    if (!sidebar) {
      // console.error("Sidebar not found.");

      return;
    }

    sidebar.classList.add("open");

    overlay?.classList.add("active");

    document.body.classList.add("sidebar-open");
  });
};
