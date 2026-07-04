const { execFile } = require("child_process");
const path = require("path");
const { suggestStories, syncStoriesFromSql } = require("../services/searchService");

const syncStories = (req, res) => {
  const crawlerPath = path.join(__dirname, "../crawlers/crawlALL.js");

  execFile(process.execPath, [crawlerPath], { timeout: 5 * 60 * 1000 }, async (error, stdout, stderr) => {
    if (error) {
      console.error("[storyController] crawl error:", error.message);
      return res.status(500).json({ message: "Crawl thất bại, vui lòng thử lại" });
    }

    if (stderr) console.error("[storyController] crawler stderr:", stderr);

    try {
      const syncResult = await syncStoriesFromSql();
      res.json({ message: "Đồng bộ truyện thành công", data: { elasticsearch: syncResult } });
    } catch (syncError) {
      console.error("[storyController] sync elasticsearch:", syncError);
      res.status(207).json({
        message: "Crawl thành công nhưng đồng bộ Elasticsearch thất bại",
        data: null,
      });
    }
  });
};

const getStories = async (req, res) => {
  const q = req.query.q?.trim();  // Lấy query từ params, loại bỏ khoảng trắng đầu/cuối
  if (!q) return res.json([]); // Nếu query rỗng, trả về mảng rỗng ngay lập tức

  try {
    const suggestions = await suggestStories(q);  // Gọi service để lấy gợi ý truyện từ Elasticsearch
    res.json(suggestions);
  } catch (err) {
    console.error("[storyController] suggest:", err); // Log lỗi để debug
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
};

module.exports = { syncStories, getStories };
