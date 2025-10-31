import jwt from 'jsonwebtoken';

export const generateToken = (id,res) => {
    const token = jwt.sign({id}, process.env.JWT_KEY, {
        expiresIn: "3d"
    });
    res.cookie("token", token, {
        maxAge: 3 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: process.env.NODE_ENV === "development" ? "lax" : "strict",
    });
    return token;
}

