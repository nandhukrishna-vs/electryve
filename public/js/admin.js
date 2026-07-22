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