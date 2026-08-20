const validateReview = ({ rating, reviewText }) => {
    const errors = {};

    const ratingNum = Number(rating);
    if (rating === undefined || rating === null || rating === "") {
        errors.rating = "Rating is required";
    } else if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        errors.rating = "Rating must be an integer from 1 to 5";
    }

    reviewText = reviewText?.trim();
    if (!reviewText) {
        errors.reviewText = "Review text is required";
    } else if (reviewText.length < 5) {
        errors.reviewText = "Review must be at least 5 characters";
    } else if (reviewText.length > 500) {
        errors.reviewText = "Review cannot exceed 500 characters";
    }

    return {
        success: Object.keys(errors).length === 0,
        errors
    };
};

export {
    validateReview
};
