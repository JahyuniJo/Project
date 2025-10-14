const fs = require('fs');
const axios = require('axios');

async function crawlComiMobi() {
  try {
    // Thử 1 trong các API endpoint này (bạn có thể đổi nếu không hoạt động)
    const url = 'https://comi.mobi/wp-json/wp/v2/manga?per_page=20';

    const { data } = await axios.get(url);

    // Kiểm tra dữ liệu lấy được
    if (!Array.isArray(data) || data.length === 0) {
      console.log('❌ Không lấy được truyện nào!');
      return;
    }

    // Chuyển đổi dữ liệu thành dạng dễ đọc
    const stories = data.map(item => ({
      id: item.id,
      title: item.title?.rendered || '',
      link: item.link || '',
      excerpt: item.excerpt?.rendered?.replace(/<[^>]*>/g, '').trim() || '',
      date: item.date,
      slug: item.slug,
    }));

    // Ghi ra file JSON
    fs.writeFileSync('comi_stories.json', JSON.stringify(stories, null, 2), 'utf8');

    console.log(`✅ Đã lưu ${stories.length} truyện vào file comi_stories.json`);
  } catch (err) {
    console.error('❌ Lỗi khi crawl:', err.message);
  }
}

crawlComiMobi();
