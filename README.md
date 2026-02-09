# Note to WordPress Automation

Note.comの最新記事を自動的にWordPressに下書きとして投稿するツールです。

## セットアップ

1. `.env.example` を `.env` にコピーして、各値を設定してください
2. `npm install` で依存関係をインストール
3. `npm start` で実行

## 環境変数

| 変数名 | 説明 |
|--------|------|
| NOTE_ID | Note.comのユーザーID |
| WP_URL | WordPressサイトのURL |
| WP_USER | WordPressユーザー名 |
| WP_APP_PASSWORD | WordPressアプリケーションパスワード |
| WP_CATEGORY_ID | 投稿先カテゴリーID（オプション） |

## GitHub Actionsでの自動実行

`.github/workflows/main.yml` により、6時間ごとに自動実行されます。
GitHub Secretsに上記の環境変数を設定してください。
