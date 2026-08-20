require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const db = require("./db");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "jwt";



const allowedOrigins = [
    "https://my-village-zeta.vercel.app",
    "http://localhost:5173"
];

app.use(
    cors({
        origin: function (origin, callback) {      
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.log("Blocked CORS origin:", origin);
            return callback(new Error("Not allowed by CORS"));
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
        ]
    })
);


app.use(express.json());


const initializeDatabaseAndServer = async () => {
    try {
        await db.connect();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Port: ${PORT}`);
        });
    } catch (error) {
        console.error("Error starting server:", error);
        process.exit(1);
    }
};

initializeDatabaseAndServer();


const authenticateToken = (request, response, next) => {
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
        return response.status(401).send("Invalid JWT Token");
    }

    const jwtToken = authHeader.split(" ")[1];

    if (!jwtToken) {
        return response.status(401).send("Invalid JWT Token");
    }

    jwt.verify(jwtToken, JWT_SECRET, (error, payload) => {
        if (error) {
            return response.status(401).send("Invalid JWT Token");
        }

        // Login creates token using email
        request.email = payload.email;

        next();
    });
};



app.get("/", (req, res) => {
    res.status(200).send("MyVillage Backend Running Successfully");
});


app.post("/register", async (req, res) => {
    try {
        const {
            email,
            password,
            name,
            phoneNumber,
            village
        } = req.body;

        if (!email || !password || !name || !phoneNumber || !village) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const selectQuery = `
            SELECT user_id
            FROM users
            WHERE email = $1
        `;

        const dbUser = await db.query(selectQuery, [email]);

        if (dbUser.rows.length > 0) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO users
            (
                email,
                password,
                name,
                phone_number,
                village,
                created_at,
                updated_at,
                role,
                profile_picture_url
            )
            VALUES
            ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7)
            RETURNING *
        `;

        const result = await db.query(insertQuery, [
            email,
            hashedPassword,
            name,
            phoneNumber,
            village,
            "RESIDENT",
            ""
        ]);

        return res.status(201).json({
            message: "User created successfully",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            message: error.message
        });
    }
});

app.post("/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const selectQuery = `
            SELECT *
            FROM users
            WHERE email = $1
        `;

        const dbUser = await db.query(selectQuery, [email]);

        if (dbUser.rows.length === 0) {
            return res.status(400).send("Invalid Email");
        }

        const user = dbUser.rows[0];

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordValid) {
            return res.status(400).send("Invalid Password");
        }

        /* JWT payload */
        const payload = {
            email: user.email
        };

        const token = jwt.sign(
            payload,
            JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        return res.status(200).json({
            token,
            name: user.name,
            userId: user.user_id,
            role: user.role,
            phone: user.phone_number,
            email: user.email
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});



app.get("/discussions", authenticateToken, async (req, res) => {
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

        const dbDiscussions = await db.query(selectQuery);

        return res.status(200).json(dbDiscussions.rows);

    } catch (error) {
        console.error("GET DISCUSSIONS ERROR:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});



app.post("/discussions", authenticateToken, async (req, res) => {
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

        const result = await db.query(insertQuery, [
            title,
            content,
            category,
            userId,
            imageUrl
        ]);

        return res.status(201).json({
            message: "Discussion created successfully",
            discussion: result.rows[0]
        });

    } catch (error) {
        console.error("CREATE DISCUSSION ERROR:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});



app.get("/issues", authenticateToken, async (req, res) => {
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

        const dbIssues = await db.query(selectQuery);

        return res.status(200).json(dbIssues.rows);

    } catch (error) {
        console.error("GET ISSUES ERROR:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});



app.post("/issues", authenticateToken, async (req, res) => {
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
            ($1, $2, $3, $4, $5, $6, NOW(), NOW())
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

        return res.status(201).json({
            message: "Issue created successfully",
            issue: result.rows[0]
        });

    } catch (error) {
        console.error("CREATE ISSUE ERROR:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});


app.put("/issues/:id", authenticateToken, async (req, res) => {
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

        return res.status(200).json({
            message: "Issue updated successfully",
            issue: result.rows[0]
        });

    } catch (error) {
        console.error("UPDATE ISSUE ERROR:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
});


app.put(
    "/users/:userId/profile-picture",
    authenticateToken,
    async (req, res) => {
        try {
            const { userId } = req.params;
            const { profile_picture_url } = req.body;

            const updateQuery = `
                UPDATE users
                SET profile_picture_url = $1
                WHERE user_id = $2
                RETURNING *
            `;

            const result = await db.query(
                updateQuery,
                [profile_picture_url, userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "User not found"
                });
            }

            return res.status(200).json({
                message: "Profile picture updated successfully",
                user: result.rows[0]
            });

        } catch (error) {
            console.error(
                "UPDATE PROFILE PICTURE ERROR:",
                error
            );

            return res.status(500).json({
                message: "Internal server error"
            });
        }
    }
);


app.use((error, req, res, next) => {
    console.error("GLOBAL ERROR:", error);

    if (error.message === "Not allowed by CORS") {
        return res.status(403).json({
            message: "CORS blocked this origin"
        });
    }

    return res.status(500).json({
        message: "Internal server error"
    });
});


module.exports = app;