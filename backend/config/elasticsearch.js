const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: 'http://localhost:9200', // URL Elasticsearch
  auth: {
    username: 'elastic', // nếu bạn bật bảo mật
    password: 'mật_khẩu_của_bạn'
  }
});

module.exports = client;
