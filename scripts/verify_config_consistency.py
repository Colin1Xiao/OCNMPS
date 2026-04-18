#!/usr/bin/env python3
"""
OCNMPS 配置一致性验证脚本

检查所有配置文件中的意图定义是否一致，防止配置漂移。
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple

# 基准配置（以 ocnmps_core.js 为准）
EXPECTED_INTENTS = {
    "MAIN", "FAST", "CODE", "CODE_PLUS", "PATCH", "DEBUG", 
    "REVIEW", "TEST", "REASON", "LONG", "CN"
}

EXPECTED_INTENTS_SORTED = sorted(EXPECTED_INTENTS)

def extract_intents_from_js(content: str) -> Set[str]:
    """从 JS 文件提取意图列表"""
    intents = set()
    
    # 匹配 modelMapping 中的键（支持带引号和不带引号）
    # 匹配："MAIN": 'value' 或 MAIN: 'value'
    pattern = r'["\']?([A-Z_]+)["\']?\s*:\s*["\']'
    matches = re.findall(pattern, content)
    intents.update(matches)
    
    # 匹配 classifyIntent 中的 return 语句
    return_pattern = r"return\s+['\"]([A-Z_]+)['\"]"
    return_matches = re.findall(return_pattern, content)
    intents.update(return_matches)
    
    # 匹配数组中的意图字符串
    array_pattern = r"['\"]([A-Z_]+)['\"]"
    array_matches = re.findall(array_pattern, content)
    intents.update(array_matches)
    
    # 过滤掉非意图的常见 JS 关键字（但保留 DEBUG 作为意图）
    filter_out = {'THE', 'AND', 'OR', 'IF', 'ELSE', 'FOR', 'WHILE', 'RETURN', 'TRUE', 'FALSE', 'NULL', 'NEW', 'THIS', 'CONST', 'LET', 'VAR', 'FUNCTION', 'ASYNC', 'AWAIT', 'TRY', 'CATCH', 'THROW', 'LOG', 'INFO', 'ERROR', 'WARN', 'OK', 'FAIL', 'PASS', 'STATUS', 'DATA', 'TEXT', 'NODE', 'FILE', 'PATH', 'DIR', 'LOG_FILE', 'PLUGIN_ID', 'CONFIG_PATH'}
    intents = intents - filter_out
    
    return intents

def extract_intents_from_py(content: str) -> Set[str]:
    """从 Python 文件提取意图列表"""
    intents = set()
    
    # 匹配字典键
    pattern = r'["\']([A-Z_]+)["\']\s*:\s*["\']'
    matches = re.findall(pattern, content)
    intents.update(matches)
    
    # 匹配 return 语句
    return_pattern = r"return\s+['\"]([A-Z_]+)['\"]"
    return_matches = re.findall(return_pattern, content)
    intents.update(return_matches)
    
    return intents

def extract_intents_from_json(content: dict) -> Tuple[Set[str], Set[str]]:
    """从 JSON 文件提取意图列表"""
    intents = set()
    enum_intents = set()
    
    # enabledIntents (顶层)
    if "enabledIntents" in content:
        intents.update(content["enabledIntents"])
        enum_intents.update(content["enabledIntents"])
    
    # modelMapping (顶层)
    if "modelMapping" in content:
        intents.update(content["modelMapping"].keys())
    
    # configSchema properties.enabledIntents.enum (openclaw.plugin.json)
    if "configSchema" in content:
        schema = content["configSchema"]
        if "properties" in schema:
            props = schema["properties"]
            if "enabledIntents" in props:
                ei = props["enabledIntents"]
                if "enum" in ei:
                    intents.update(ei["enum"])
                    enum_intents.update(ei["enum"])
                if "default" in ei:
                    intents.update(ei["default"])
    
    # 嵌套 configSchema (某些配置可能嵌套)
    if "config" in content:
        config = content["config"]
        if "schema" in config:
            schema = config["schema"]
            if "properties" in schema:
                props = schema["properties"]
                if "enabledIntents" in props:
                    ei = props["enabledIntents"]
                    if "enum" in ei:
                        intents.update(ei["enum"])
    
    return intents, enum_intents

def check_file(filepath: Path, file_type: str) -> Tuple[Set[str], List[str]]:
    """检查单个文件的意图配置"""
    try:
        content = filepath.read_text(encoding='utf-8')
        
        if file_type == "js":
            intents = extract_intents_from_js(content)
        elif file_type == "py":
            intents = extract_intents_from_py(content)
        elif file_type == "json":
            data = json.loads(content)
            intents, _ = extract_intents_from_json(data)
        else:
            return set(), [f"Unknown file type: {file_type}"]
        
        issues = []
        
        # 检查缺失的意图
        missing = EXPECTED_INTENTS - intents
        if missing:
            issues.append(f"缺失意图：{', '.join(sorted(missing))}")
        
        # 检查多余的意图
        extra = intents - EXPECTED_INTENTS
        if extra:
            issues.append(f"多余意图：{', '.join(sorted(extra))}")
        
        return intents, issues
        
    except Exception as e:
        return set(), [f"读取失败：{e}"]

def main():
    """主函数"""
    base_dir = Path(__file__).parent
    workspace_dir = Path.home() / ".openclaw" / "workspace"
    
    print("=" * 70)
    print("OCNMPS 配置一致性验证")
    print("=" * 70)
    print(f"\n基准意图 ({len(EXPECTED_INTENTS)} 个):")
    print(f"  {', '.join(EXPECTED_INTENTS_SORTED)}")
    print()
    
    # 检查的文件列表
    files_to_check = [
        (base_dir / "ocnmps_core.js", "js", "核心路由逻辑 (基准)"),
        (base_dir / "ocnmps_bridge_v2.py", "py", "Python Bridge"),
        (base_dir / "ocnmps_plugin_config.json", "json", "插件配置"),
        (base_dir / "openclaw.plugin.json", "json", "Plugin Manifest"),
        (base_dir / "plugin.js", "js", "插件入口"),
    ]
    
    all_passed = True
    results = []
    
    for filepath, file_type, description in files_to_check:
        if not filepath.exists():
            print(f"⚠️  {description}: 文件不存在 - {filepath}")
            continue
        
        intents, issues = check_file(filepath, file_type)
        
        status = "✅" if not issues else "❌"
        intent_count = len(intents) if intents else 0
        
        print(f"{status} {description}")
        print(f"   文件：{filepath.name}")
        print(f"   意图数：{intent_count} / {len(EXPECTED_INTENTS)}")
        
        if intents:
            missing = EXPECTED_INTENTS - intents
            extra = intents - EXPECTED_INTENTS
            if missing:
                print(f"   🔴 缺失：{', '.join(sorted(missing))}")
            if extra:
                print(f"   🟡 多余：{', '.join(sorted(extra))}")
        
        if issues:
            all_passed = False
            for issue in issues:
                print(f"   ⚠️  {issue}")
        
        print()
        results.append((filepath, intents, issues))
    
    print("=" * 70)
    if all_passed:
        print("✅ 所有配置文件意图一致！")
        return 0
    else:
        print("❌ 发现配置不一致，请修复上述问题")
        print()
        print("修复建议:")
        print("  1. 以 ocnmps_core.js 为基准（11 个意图）")
        print("  2. 更新其他文件的 INTENT_MODEL_MAP / modelMapping")
        print("  3. 更新 openclaw.plugin.json 的 configSchema.properties.enabledIntents.enum")
        print("  4. 运行此脚本验证修复结果")
        return 1

if __name__ == "__main__":
    sys.exit(main())
