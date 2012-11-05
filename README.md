# ISUCON 2 #

- by sugyan
  - /webapp/perl
  - /webapp/ruby
  - /webapp/nodejs
- by faultier
  - /webapp/php
- by just\_do\_neet
  - /webapp/java
- by xxxxxx
  - /webapp/python
- by tagomoris
  - /tools

And many many patches by kazeburo.

## web app ##

- /webapp/perl
- /webapp/php
- /webapp/nodejs
- /webapp/ruby
- /webapp/python
- /webapp/java

### Webアプリの基本方針 ###

- 処理はすべてリクエストを受け取ってから実施する
  - DBへのクエリ
  - テンプレートからのレンダリング
- 全てのコンテンツをアプリケーションから渡す
  - js/css/画像も含めて
  - キャッシュ等はとりあえず全て無し

### 実装するリクエストハンドラ ###

- `/`
  - GET
  - artistのリスト
    - `SELECT * FROM artist ORDER BY id`

- `/artist/:artistid`
  - GET
  - ticketのリスト 合計の残り枚数表示
    - `SELECT id, name FROM artist WHERE id = ? LIMIT 1`
    - `SELECT id, name FROM ticket WHERE artist_id = ? ORDER BY id`
    - `SELECT COUNT(*) FROM variation INNER JOIN stock ON stock.variation_id = variation.id WHERE variation.ticket_id = ? AND stock.order_id IS NULL`

- `/ticket/:ticket`
  - GET
  - variationのリスト 各種残り枚数表示
    - `SELECT t.*, a.name AS artist_name FROM ticket t INNER JOIN artist a ON t.artist_id = a.id WHERE t.id = ? LIMIT 1`
    - `SELECT id, name FROM variation WHERE ticket_id = ? ORDER BY id`
    - `SELECT seat_id, order_id FROM stock WHERE variation_id = ?`
    - `SELECT COUNT(*) FROM stock WHERE variation_id = ? AND order_id IS NULL`
  
- `/buy`
  - POST
  - チケットの購入 stockの在庫を1つ抑え席番を表示 `member_id`を受け取り`order_request`に保存
    - `START TRANSACTION`
    - `INSERT INTO order_request (member_id) VALUES (?)`
    - `UPDATE stock SET order_id = ? WHERE variation_id = ? AND order_id IS NULL ORDER BY RAND() LIMIT 1`
    - `COMMIT`

- なお、全ページ左側のサイドバーに「最近購入されたチケット10件」を表示
 - ```
SELECT stock.seat_id, variation.name AS v_name, ticket.name AS t_name, artist.name AS a_name FROM stock
  JOIN variation ON stock.variation_id = variation.id
  JOIN ticket ON variation.ticket_id = ticket.id
  JOIN artist ON ticket.artist_id = artist.id
WHERE order_id IS NOT NULL
ORDER BY order_id DESC LIMIT 10
```

### staticファイル ###

- images
 - isucon_title ロゴ
- js
 - jquery 最新版minified
 - jquery-ui 最新版minified
 - isucon2.js
- css
 - jquery-ui ui-lightness
 - isucon2.css デザイン調整用

## benchmark tool ##

- /tools
