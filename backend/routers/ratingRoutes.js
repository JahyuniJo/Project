const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const auth = require("../middleware/authMiddleware");

// ===================== GET AVG RATING =====================
router.get("/", async (req, res) => {
    const { story_id } = req.query;

    if (!story_id) {
        return res.status(400).json({ message: "Thiếu story_id" });
    }

    try {
        const result = await pool.query(`
            SELECT 
                COALESCE(AVG(rating), 0) AS avg_rating,
                COUNT(*) AS total
            FROM ratings
            WHERE story_id = $1
        `, [story_id]);

        res.json({
            avg: Number(result.rows[0].avg_rating),
            total: Number(result.rows[0].total)
        });

    } catch (err) {
        console.error("SQL ERROR /api/rating GET:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

// ===================== CREATE / UPDATE RATING =====================
router.post("/", auth, async (req, res) => {
    const { story_id, rating } = req.body;

    if (!story_id || !rating) {
        return res.status(400).json({ message: "Thiếu dữ liệu" });
    }

    try {
        await pool.query(`
            INSERT INTO ratings (story_id, user_id, rating)
            VALUES ($1, $2, $3)
            ON CONFLICT (story_id, user_id)
            DO UPDATE SET rating = EXCLUDED.rating
        `, [story_id, req.user.userId, rating]);

        res.json({ message: "Đánh giá thành công" });

    } catch (err) {
        console.error("SQL ERROR /api/rating POST:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

module.exports = router;
