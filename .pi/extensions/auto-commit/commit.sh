#!/bin/bash
# 根据 git 变更自动生成 commit 摘要并提交

API_KEY=$(jq -r '.deepseek.key // empty' ~/.pi/agent/auth.json 2>/dev/null)

if [ -z "$API_KEY" ]; then
  echo "git commit: ❌ 找不到 API Key"
  exit 1
fi

GIT_DIFF="$1"
API_URL="https://api.deepseek.com/v1/chat/completions"

PROMPT="根据以下 git diff --stat 生成一句中文 git commit 摘要（遵循 conventional commits，不超过 30 字，不要引号）：

${GIT_DIFF}"

SUMMARY=$(curl -s "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$(jq -n \
    --arg prompt "$PROMPT" \
    '{
      model: "deepseek-chat",
      messages: [{role: "user", content: $prompt}],
      max_tokens: 80,
      temperature: 0.3
    }')" | jq -r '.choices[0].message.content // empty')

if [ -z "$SUMMARY" ]; then
  echo "git commit: ❌ 摘要生成失败"
  exit 1
fi

git add -A 2>/dev/null
git commit -m "$SUMMARY" 2>/dev/null
echo "git commit -m \"$SUMMARY\""
