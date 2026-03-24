#!/usr/bin/env python3
"""
OCNMPS Bridge V2 - OpenClaw Plugin Integration

供 Node.js 插件调用的 Python 桥接脚本。

输入：JSON payload (stdin)
输出：JSON result (stdout)

使用方式：
    echo '{"task": "写一个 Python 函数..."}' | python3 ocnmps_bridge_v2.py --json
"""

import sys
import json
import random
import re
from typing import Dict, Optional, List, Any
from dataclasses import dataclass
from pathlib import Path

# ============================================================
# 配置
# ============================================================

# 灰度配置（从环境变量或配置文件读取）
GRAY_RATIO = 0.3  # 30% 流量走灰度

# 意图关键词映射
INTENT_KEYWORDS = {
    "CODE": [
        "写代码", "写一个函数", "编程", "python", "javascript", "代码",
        "function", "class", "method", "debug", "fix", "refactor",
        "脚本", "程序", "实现", "开发", "bug", "错误", "优化代码",
        "code", "programming", "developer", "api", "sdk", "library",
        "算法", "数据结构", "leetcode", "coding",
    ],
    "REASON": [
        "分析", "推理", "为什么", "原因", "逻辑", "论证", "证明",
        "think", "analyze", "reason", "why", "explain", "逻辑推理",
        "因果关系", "推导", "演绎", "归纳", "深度分析",
        "思考", "权衡", "利弊", "决策", "判断",
    ],
    "LONG": [
        "长文", "详细", "完整", "深入", "全面", "总结", "报告",
        "article", "essay", "document", "comprehensive", "detailed",
        "文档", "论文", "文章", "教程", "指南", "手册",
        "调研", "研究", "分析报告", "白皮书",
    ],
    "CN": [
        "中文", "汉语", "翻译成中文", "用中文", "中文版",
        "chinese", "mandarin", "中文回答", "中国", "国内",
    ],
}

# 推荐模型映射
INTENT_MODEL_MAP = {
    "CODE": "bailian/qwen3-coder-next",
    "REASON": "xai/grok-4-1-fast-reasoning",
    "LONG": "bailian/qwen3.5-plus",
    "CN": "bailian/MiniMax-M2.5",
    "MAIN": "bailian/kimi-k2.5",  # 默认
}

# ============================================================
# 意图分类
# ============================================================

def classify_intent(task: str) -> str:
    """
    根据任务文本分类意图
    
    Returns:
        意图类型: CODE, REASON, LONG, CN, MAIN
    """
    task_lower = task.lower()
    
    # 计算每个意图的匹配分数
    scores: Dict[str, int] = {}
    
    for intent, keywords in INTENT_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw.lower() in task_lower:
                score += 1
        scores[intent] = score
    
    # 找最高分
    max_score = max(scores.values())
    if max_score == 0:
        return "MAIN"  # 无匹配，使用默认
    
    # 返回最高分意图
    for intent, score in scores.items():
        if score == max_score:
            return intent
    
    return "MAIN"

# ============================================================
# 灰度判断
# ============================================================

def should_use_ocnmps(
    task: str,
    gray_ratio: float = GRAY_RATIO,
    session_id: Optional[str] = None,
) -> bool:
    """
    判断是否走 OCNMPS 路由
    
    使用 session_id 作为灰度分桶依据，保证同一会话一致性
    """
    if gray_ratio <= 0:
        return False
    if gray_ratio >= 1:
        return True
    
    # 使用 session_id 做一致性哈希
    if session_id:
        hash_val = hash(session_id) % 100
        return hash_val < gray_ratio * 100
    
    # 无 session_id，随机判断
    return random.random() < gray_ratio

# ============================================================
# Chain 生成（第一阶段不启用）
# ============================================================

def generate_chain(intent: str) -> List[str]:
    """
    生成执行链
    
    第一阶段返回空链，不启用多模型执行
    """
    # TODO: 未来启用 chain
    return []

# ============================================================
# 主路由函数
# ============================================================

def route_with_gray_release(
    task: str,
    agent_id: Optional[str] = None,
    session_id: Optional[str] = None,
    config: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    灰度路由主函数
    
    Returns:
        {
            "gray_hit": bool,
            "use_ocnmps": bool,
            "intent": str,
            "recommended_model": str,  # provider/model 格式
            "chain": List[str],
            "confidence": float,
        }
    """
    config = config or {}
    gray_ratio = config.get("grayRatio", GRAY_RATIO)
    enabled_intents = config.get("enabledIntents", list(INTENT_MODEL_MAP.keys()))
    
    # 1. 判断灰度
    gray_hit = should_use_ocnmps(task, gray_ratio, session_id)
    
    if not gray_hit:
        return {
            "gray_hit": False,
            "use_ocnmps": False,
            "intent": "MAIN",
            "recommended_model": INTENT_MODEL_MAP["MAIN"],
            "chain": [],
            "confidence": 1.0,
            "reason": "gray_release_miss",
        }
    
    # 2. 分类意图
    intent = classify_intent(task)
    
    # 3. 检查意图是否启用
    if intent not in enabled_intents:
        return {
            "gray_hit": True,
            "use_ocnmps": False,
            "intent": intent,
            "recommended_model": INTENT_MODEL_MAP["MAIN"],
            "chain": [],
            "confidence": 0.5,
            "reason": "intent_not_enabled",
        }
    
    # 4. 获取推荐模型
    recommended_model = INTENT_MODEL_MAP.get(intent, INTENT_MODEL_MAP["MAIN"])
    
    # 5. 生成 chain（第一阶段不启用）
    chain = generate_chain(intent)
    
    return {
        "gray_hit": True,
        "use_ocnmps": True,
        "intent": intent,
        "recommended_model": recommended_model,
        "chain": chain,
        "confidence": 0.85,
    }

# ============================================================
# CLI 入口
# ============================================================

def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description="OCNMPS Bridge V2")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--task", type=str, help="Task text (alternative to stdin)")
    args = parser.parse_args()
    
    # 读取输入
    if args.task:
        payload = {"task": args.task}
    else:
        try:
            payload = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON: {e}"}), file=sys.stderr)
            sys.exit(1)
    
    task = payload.get("task", "")
    agent_id = payload.get("agent_id")
    session_id = payload.get("session_id")
    config = payload.get("config", {})
    
    if not task:
        result = {
            "error": "No task provided",
            "gray_hit": False,
            "use_ocnmps": False,
        }
    else:
        result = route_with_gray_release(
            task=task,
            agent_id=agent_id,
            session_id=session_id,
            config=config,
        )
    
    # 输出结果
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()