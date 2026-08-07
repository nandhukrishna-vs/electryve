const Toast = Swal.mixin({

    toast: true,

    position: "top-end",

    showConfirmButton: false,

    timer: 3000,

    timerProgressBar: true,

    didOpen: (toast) => {

        toast.onmouseenter = Swal.stopTimer;

        toast.onmouseleave = Swal.resumeTimer;

    }

});

const showSuccess = (message) => {

    Toast.fire({

        icon: "success",

        title: message

    });

};

const showError = (message) => {

    Toast.fire({

        icon: "error",

        title: message

    });

};

const showWarning = (message) => {

    Toast.fire({

        icon: "warning",

        title: message

    });

};

const showInfo = (message) => {

    Toast.fire({

        icon: "info",

        title: message

    });

};

const confirmAction = async (

    title,

    text,

    confirmText = "Yes"

) => {

    return await Swal.fire({

        title,

        text,

        icon: "warning",

        showCancelButton: true,

        confirmButtonColor: "#0d6efd",

        cancelButtonColor: "#6c757d",

        confirmButtonText: confirmText,

        reverseButtons: true

    });

};
window.showSuccess = showSuccess;

window.showError = showError;

window.showWarning = showWarning;

window.showInfo = showInfo;

window.confirmAction = confirmAction;