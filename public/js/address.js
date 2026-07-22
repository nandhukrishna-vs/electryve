// ===============================
// Address Type Selection
// ===============================

const cards = document.querySelectorAll(".address-type-card");

cards.forEach(card => {

    card.addEventListener("click", () => {

        cards.forEach(c => c.classList.remove("active"));

        card.classList.add("active");

        card.querySelector("input").checked = true;

    });

});

// ===============================
// Delete Address Confirmation
// ===============================

const deleteForms = document.querySelectorAll(".delete-form");

deleteForms.forEach(form => {

    form.addEventListener("submit", function (e) {

        e.preventDefault();

        Swal.fire({

            title: "Delete Address?",

            text: "You won't be able to recover this address.",

            icon: "warning",

            showCancelButton: true,

            confirmButtonColor: "#dc3545",

            cancelButtonColor: "#6c757d",

            confirmButtonText: "Yes, Delete",

            cancelButtonText: "Cancel",

            reverseButtons: true

        }).then((result) => {

            if (result.isConfirmed) {

                form.submit();

            }

        });

    });

});