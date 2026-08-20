require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const db = require("./db");

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "jwt";

// =========================
// CORS
// =========================

const allowedOrigins = [
    "https://my-village-zeta.vercel.app",
    "http://localhost:5173",
];

const corsOptions = {
    origin: function (origin, callback) {

        // Allow requests without an origin
        // and allowed frontend origins
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.log("Blocked CORS origin:", origin);

        return callback(
            new Error("Not allowed by CORS")
        );
    },

    methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: true
};

app.use(cors(corsOptions));

app.use(express.json());


// =========================
// JWT AUTHENTICATION
// =========================

const authenticateToken = (request, response, next) => {

    const authHeader = request.headers["authorization"];

    if (!authHeader) {
        return response
            .status(401)
            .send("Invalid JWT Token");
    }

    const jwtToken = authHeader.split(" ")[1];

    if (!jwtToken) {
        return response
            .status(401)
            .send("Invalid JWT Token");
    }

    jwt.verify(
        jwtToken,
        JWT_SECRET,
        (error, payload) => {

            if (error) {
                return response
                    .status(401)
                    .send("Invalid JWT Token");
            }

            request.username = payload.email;

            next();
        }
    );
};


// =========================
// HEALTH CHECK
// =========================

app.get("/", (req, res) => {

    res.status(200).send(
        "MyVillage Backend Running Successfully"
    );

});


// =========================
// REGISTER
// =========================

app.post("/register", async (req, res) => {

    try {

        const {
            email,
            password,
            name,
            phoneNumber,
            village
        } = req.body;

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const selectQuery = `
            SELECT *
            FROM users
            WHERE email = $1
        `;

        const dbUser = await db.query(
            selectQuery,
            [email]
        );

        if (dbUser.rows.length !== 0) {

            return res.status(400).send(
                "User already exists"
            );
        }

        const insertQuery = `
            INSERT INTO users
            (
                email,
                password,
                name,
                phone_number,
                village
            )
            VALUES ($1, $2, $3, $4, $5)
        `;

        await db.query(
            insertQuery,
            [
                email,
                hashedPassword,
                name,
                phoneNumber,
                village
            ]
        );

        res.status(200).send(
            "User created successfully"
        );

    } catch (error) {

        console.error(
            "Register error:",
            error
        );

        res.status(500).json({
            message: "Registration failed",
            error: error.message
        });
    }
});


// =========================
// LOGIN
// =========================

app.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;

        const selectQuery = `
            SELECT *
            FROM users
            WHERE email = $1
        `;

        const dbUser = await db.query(
            selectQuery,
            [email]
        );

        if (dbUser.rows.length === 0) {

            return res.status(400).send(
                "Invalid Email"
            );
        }

        const user = dbUser.rows[0];

        const isPasswordValid =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!isPasswordValid) {

            return res.status(400).send(
                "Invalid Password"
            );
        }

        const payload = {
            email: user.email
        };

        const token = jwt.sign(
            payload,
            JWT_SECRET
        );

        res.status(200).json({

            token,

            name: user.name,

            userId: user.user_id,

            role: user.role,

            phone: user.phone_number,

            email: user.email

        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        res.status(500).json({
            message: "Login failed",
            error: error.message
        });
    }
});


// =========================
// GET DISCUSSIONS
// =========================

app.get(
    "/discussions",
    authenticateToken,
    async (req, res) => {

        try {

            const selectQuery = `
                SELECT
                    d.*,
                    u.name,
                    u.role,
                    u.profile_picture_url
                FROM discussions d
                INNER JOIN users u
                    ON d.user_id = u.user_id
                ORDER BY d.created_at DESC
            `;

            const dbDiscussions =
                await db.query(selectQuery);

            res.status(200).json(
                dbDiscussions.rows
            );

        } catch (error) {

            console.error(
                "Get discussions error:",
                error
            );

            res.status(500).json({
                message: "Failed to get discussions",
                error: error.message
            });
        }
    }
);


// =========================
// CREATE DISCUSSION
// =========================

app.post(
    "/discussions",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                title,
                content,
                category,
                userId,
                imageUrl
            } = req.body;

            const insertQuery = `
                INSERT INTO discussions
                (
                    title,
                    content,
                    category,
                    user_id,
                    image_url
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            await db.query(
                insertQuery,
                [
                    title,
                    content,
                    category,
                    userId,
                    imageUrl
                ]
            );

            res.status(201).json({
                message:
                    "Discussion created successfully"
            });

        } catch (error) {

            console.error(
                "Create discussion error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to create discussion",
                error: error.message
            });
        }
    }
);


// =========================
// GET ISSUES
// =========================

app.get(
    "/issues",
    authenticateToken,
    async (req, res) => {

        try {

            const selectQuery = `
                SELECT
                    i.*,
                    u.name,
                    u.profile_picture_url
                FROM issues i
                INNER JOIN users u
                    ON i.user_id = u.user_id
                ORDER BY i.created_at DESC
            `;

            const dbIssues =
                await db.query(selectQuery);

            res.status(200).json(
                dbIssues.rows
            );

        } catch (error) {

            console.error(
                "Get issues error:",
                error
            );

            res.status(500).json({
                message: "Failed to get issues",
                error: error.message
            });
        }
    }
);


// =========================
// CREATE ISSUE
// =========================

app.post(
    "/issues",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                title,
                description,
                category,
                location,
                userId,
                image
            } = req.body;

            const result = await db.query(
                `
                INSERT INTO issues
                (
                    title,
                    description,
                    category,
                    location,
                    user_id,
                    image_url,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    NOW(),
                    NOW()
                )
                RETURNING *
                `,
                [
                    title,
                    description,
                    category,
                    location,
                    userId,
                    image
                ]
            );

            res.status(201).json({
                message:
                    "Issue created successfully",
                issue: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Create issue error:",
                error
            );

            res.status(500).json({
                message: "Failed to create issue",
                error: error.message
            });
        }
    }
);


// =========================
// UPDATE ISSUE STATUS
// =========================

app.put(
    "/issues/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const { id } = req.params;
            const { status } = req.body;

            const updateQuery = `
                UPDATE issues
                SET
                    status = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;

            const result = await db.query(
                updateQuery,
                [status, id]
            );

            if (result.rows.length === 0) {

                return res.status(404).json({
                    message: "Issue not found"
                });
            }

            res.status(200).json({
                message:
                    "Issue updated successfully",
                issue: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Update issue error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to update issue",
                error: error.message
            });
        }
    }
);


// =========================
// UPDATE PROFILE PICTURE
// =========================

app.put(
    "/users/:userId/profile-picture",
    authenticateToken,
    async (req, res) => {

        try {

            const { userId } = req.params;

            const {
                profile_picture_url
            } = req.body;

            console.log(
                "Updating profile picture:",
                userId
            );

            if (!profile_picture_url) {

                return res.status(400).json({
                    message:
                        "Profile picture URL is required"
                });
            }

            const updateQuery = `
                UPDATE users
                SET profile_picture_url = $1
                WHERE user_id = $2
                RETURNING
                    user_id,
                    profile_picture_url
            `;

            const result = await db.query(
                updateQuery,
                [
                    profile_picture_url,
                    userId
                ]
            );

            if (result.rows.length === 0) {

                return res.status(404).json({
                    message: "User not found"
                });
            }

            res.status(200).json({
                message:
                    "Profile picture updated successfully",
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Profile picture update error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to update profile picture",
                error: error.message
            });
        }
    }
);


// =========================
// EXPORT FOR VERCEL
// =========================

module.exports = app;