import multer from "multer";

const uploadErrorHandler = (err, req, res, next) => {

  if (err instanceof multer.MulterError) {

    if (err.code === "LIMIT_FILE_SIZE") {

      return res.status(400).json({

        success: false,

        message: "Image size must be less than 2 MB."

      });

    }

  }

  if (err) {

    return res.status(400).json({

      success: false,

      message: err.message

    });

  }

  next();

};

export default uploadErrorHandler;