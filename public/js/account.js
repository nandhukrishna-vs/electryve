const avatarForm = document.getElementById("avatarForm");
const avatarInput = document.getElementById("avatarInput");

if (avatarForm && avatarInput) {

    avatarInput.addEventListener("change", async () => {

        if (!avatarInput.files.length) return;

        const formData = new FormData(avatarForm);

        try {

            const response = await fetch("/profile/avatar", {

                method: "POST",

                headers: {
                    Accept: "application/json"
                },

                body: formData

            });

            const result = await response.json();

            if (!result.success) {
    await Swal.fire({
        icon: "error",
        title: "Upload Failed",
        text: result.message,
        confirmButtonColor: "#dc3545",
    });

    return;
}

            // Update every avatar on the page
            document
                .querySelectorAll(".avatar-image")
                .forEach(img => {

                    img.src =
                        result.avatar +
                        "?t=" +
                        Date.now();

                });

            await Swal.fire({
    icon: "success",
    title: "Success!",
    text: result.message,
    timer: 1500,
    showConfirmButton: false,
});

        }

        catch (err) {

            console.error(err);

        }

    });

}