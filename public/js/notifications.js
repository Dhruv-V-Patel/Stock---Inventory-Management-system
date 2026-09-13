window.socket = io();
const loadNotifications = async () => {
  try {
    const token = localStorage.getItem("accessToken");

    const response = await fetch("/api/notifications", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message);
    }

    await renderNotifications(result.notifications || []);

    const hasUnread = (result.notifications || []).some(
      (notification) => !notification.is_read,
    );

    notificationDot.classList.toggle("hidden", !hasUnread);
  } catch (error) {
    console.error("Load Notifications:", error);

    notificationList.innerHTML = `
            <div class="notification-empty">
                Failed to load notifications.
            </div>
        `;
  }
};

const getNotificationIcon = (type) => {
  switch (type) {
    case "purchase_created":
      return "fa-solid fa-cart-plus";
    
    case "purchase_updated":
    case "purchase_deleted":
      return "fa-solid fa-cart-shopping";

    case "production_created":
    case "production_updated":
    case "production_deleted":
      return "fa-solid fa-industry";

    case "sale_created":
    case "sale_updated":
    case "sale_deleted":
      return "fa-solid fa-truck";

    case "payment_received":
    case "payment_made":
    case "payment_received_updated":
    case "payment_made_updated":
    case "payment_received_deleted":
    case "payment_made_deleted":
      return "fa-solid fa-money-bill-wave";

    default:
      return "fa-solid fa-bell";
  }
};
const renderNotifications = (notifications) => {
  if (!notificationList) return;

  if (!notifications.length) {
    notificationList.innerHTML = `
            <div class="notification-empty">
                <i class="fa-regular fa-bell-slash"></i>
                <p>No notifications found.</p>
            </div>
        `;
    return;
  }
  // const unreadClass = notification.is_read? "" : "notification-unread";

  notificationList.innerHTML = notifications.map((notification) => { 
    const unreadClass = notification.is_read ? "" : "notification-unread";
    return `
    <div
        class="notification-item ${unreadClass}"
        data-type="${notification.reference_type}"
        data-id="${notification.reference_id}"
    >

        <div class="notification-icon">
                <i class="${getNotificationIcon(notification.type)}"></i>
            </div>


        <div class="notification-content">

            <div class="notification-title">
                ${notification.title}
            </div>

            <div class="notification-message">
                ${notification.message}
            </div>

            <div class="notification-time">
                ${formatNotificationTime(notification.created_at)}
            </div>

        </div>

    </div>
`;
}).join("");
};

const formatNotificationTime = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};
const markNotificationsRead = async () => {
  try {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      },
    });

    // notificationDot.classList.add("hidden");

    await loadNotifications();
  } catch (error) {
    console.error("Mark notifications read:", error);
  }
};

const initializeNotifications = async () => {
  const notificationButton = document.getElementById("notificationButton");
  const notificationDropdown = document.getElementById("notificationDropdown");
  const notificationList = document.getElementById("notificationList");
  const notificationDot = document.getElementById("notificationDot");

  if (!notificationButton || !notificationDropdown) {
    return;
  }

  notificationButton.addEventListener("click", async (event) => {
    event.stopPropagation();

    const isOpen = notificationDropdown.classList.toggle("show");

    if (isOpen) {
      await loadNotifications();
    }
  });

  notificationDropdown.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", async (event) => {
    if (
      notificationDropdown.classList.contains("show") &&
      !notificationDropdown.contains(event.target) &&
      !notificationButton.contains(event.target)
    ) {
      notificationDropdown.classList.remove("show");

      await markNotificationsRead();
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (event.key !== "Escape") return;

    if (!notificationDropdown.classList.contains("show")) return;

    notificationDropdown.classList.remove("show");

    await markNotificationsRead();
  });

  notificationList.addEventListener("click", async (e) => {
    const item = e.target.closest(".notification-item");

    if (!item) return;

    const type = item.dataset.type;
    const id = item.dataset.id;

    console.log(type, id);

    switch (type) {
      case "payment":
        window.location.href = `/payments?id=${id}`;
        break;

      case "party":
        window.location.href = `/parties?id=${id}`;
        break;

      case "agent":
        window.location.href = `/agents?id=${id}`;
        break;
    }
    await markNotificationsRead();

  });

  window.socket.on("notification:new", async () => {
    notificationDot.classList.remove("hidden");

    if (notificationDropdown.classList.contains("show")) {
      await loadNotifications();
    }
  });
  await loadNotifications();
};

window.initializeNotifications = initializeNotifications;
