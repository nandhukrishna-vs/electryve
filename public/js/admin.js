const toggleForms = document.querySelectorAll(".toggle-user-form");

toggleForms.forEach(form => {

    form.addEventListener("submit", function (e) {

        e.preventDefault();

        const button = form.querySelector("button");

        const isBlock = button.textContent.trim() === "Block";

        Swal.fire({

            title: isBlock
                ? "Block User?"
                : "Unblock User?",

            text: isBlock
                ? "The user will no longer be able to access the application."
                : "The user will be allowed to login again.",

            icon: "warning",

            showCancelButton: true,

            confirmButtonColor: isBlock
                ? "#dc3545"
                : "#198754",

            cancelButtonColor: "#6c757d",

            confirmButtonText: isBlock
                ? "Yes, Block"
                : "Yes, Unblock",

            cancelButtonText: "Cancel",

            reverseButtons: true

        }).then(async (result) => {

            if (result.isConfirmed) {

    try {

        const response = await fetch(form.action, {
          

            method: "POST",

            headers: {

                Accept: "application/json"

            }

        });
          console.log(response);

        const result = await response.json();

console.log(result);

if (result.success) {

    await Swal.fire({
        icon: "success",
        title: "Success",
        text: result.message,
        timer: 1500,
        showConfirmButton: false
    });

    window.location.href = result.redirect;

} else {

    await Swal.fire({
        icon: "error",
        title: "Error",
        text: result.message
    });

}

    }

    catch (error) {

        console.error(error);

    }

}

        });

    });

});

// Admin Navigation & Mobile Sidebar Handler
document.addEventListener("DOMContentLoaded", function () {
    // 1. Highlight Active Sidebar Navigation Link
    const currentPath = window.location.pathname;
    const sidebarLinks = document.querySelectorAll(".sidebar a");

    sidebarLinks.forEach(link => {
        const href = link.getAttribute("href");
        if (href) {
            // Match exact path or subpaths (e.g. /admin/orders matches /admin/orders/123)
            if (currentPath === href) {
                link.classList.add("active");
            } else if (href !== "/admin/dashboard" && href !== "/admin" && currentPath.startsWith(href)) {
                link.classList.add("active");
            }
        }
    });

    // 2. Mobile Sidebar Offcanvas Toggle
    const toggleBtn = document.getElementById("adminSidebarToggle");
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("adminSidebarBackdrop");

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener("click", function () {
            sidebar.classList.toggle("show");
            if (backdrop) backdrop.classList.toggle("show");
        });
    }

    if (backdrop && sidebar) {
        backdrop.addEventListener("click", function () {
            sidebar.classList.remove("show");
            backdrop.classList.remove("show");
        });
    }

    // Auto-close sidebar on mobile navigation click
    sidebarLinks.forEach(link => {
        link.addEventListener("click", function () {
            if (window.innerWidth < 768 && sidebar) {
                sidebar.classList.remove("show");
                if (backdrop) backdrop.classList.remove("show");
            }
        });
    });
});