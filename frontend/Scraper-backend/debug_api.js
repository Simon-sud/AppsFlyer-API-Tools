#!/usr/bin/env node

// Google Play Scraper API 调试脚本
// 使用方法: node debug_api.js

const gplay = require('google-play-scraper');

console.log('🔍 Google Play Scraper API 调试');
console.log('=====================================');

// 1. 检查库的基本信息
console.log('\n1. 库信息:');
console.log('版本:', require('./package.json').dependencies['google-play-scraper']);
console.log('可用方法:', Object.keys(gplay).filter(key => typeof gplay[key] === 'function'));

// 2. 测试搜索功能
console.log('\n2. 测试搜索功能:');
async function testSearch() {
    try {
        console.log('搜索 "facebook"...');
        const results = await gplay.search({
            term: 'facebook',
            num: 3,
            lang: 'en',
            country: 'us'
        });
        console.log('搜索结果数量:', results.length);
        if (results.length > 0) {
            console.log('第一个结果:', {
                appId: results[0].appId,
                title: results[0].title,
                developer: results[0].developer
            });
        }
    } catch (error) {
        console.error('搜索失败:', error.message);
        console.error('错误详情:', error);
    }
}

// 3. 测试应用详情获取
console.log('\n3. 测试应用详情获取:');
async function testAppDetails() {
    try {
        console.log('获取 com.facebook.katana 详情...');
        const appDetails = await gplay.app({
            appId: 'com.facebook.katana',
            lang: 'en',
            country: 'us'
        });
        console.log('应用详情获取成功:', {
            appId: appDetails.appId,
            title: appDetails.title,
            developer: appDetails.developer,
            score: appDetails.score,
            reviews: appDetails.reviews
        });
    } catch (error) {
        console.error('获取应用详情失败:', error.message);
        console.error('错误详情:', error);
        console.error('错误堆栈:', error.stack);
    }
}

// 4. 测试分类列表
console.log('\n4. 测试分类列表:');
async function testCategories() {
    try {
        console.log('获取分类列表...');
        // 尝试不同的方法名
        if (typeof gplay.categories === 'function') {
            const categories = await gplay.categories();
            console.log('分类数量:', categories.length);
        } else if (typeof gplay.getCategories === 'function') {
            const categories = await gplay.getCategories();
            console.log('分类数量:', categories.length);
        } else {
            console.log('未找到分类方法');
        }
    } catch (error) {
        console.error('获取分类失败:', error.message);
    }
}

// 5. 测试列表功能
console.log('\n5. 测试列表功能:');
async function testList() {
    try {
        console.log('获取游戏分类应用列表...');
        const apps = await gplay.list({
            category: 'GAME_CASUAL',
            num: 3,
            lang: 'en',
            country: 'us'
        });
        console.log('应用列表数量:', apps.length);
        if (apps.length > 0) {
            console.log('第一个应用:', {
                appId: apps[0].appId,
                title: apps[0].title
            });
        }
    } catch (error) {
        console.error('获取应用列表失败:', error.message);
        console.error('错误详情:', error);
    }
}

// 6. 测试开发者信息
console.log('\n6. 测试开发者信息:');
async function testDeveloper() {
    try {
        console.log('获取 Facebook 开发者信息...');
        const devApps = await gplay.developer({
            devId: 'Facebook',
            num: 3,
            lang: 'en',
            country: 'us'
        });
        console.log('开发者应用数量:', devApps.length);
    } catch (error) {
        console.error('获取开发者信息失败:', error.message);
    }
}

// 运行所有测试
async function runAllTests() {
    try {
        await testSearch();
        await testAppDetails();
        await testCategories();
        await testList();
        await testDeveloper();
        
        console.log('\n✅ 所有测试完成');
    } catch (error) {
        console.error('\n❌ 测试过程中发生错误:', error);
    }
}

// 执行测试
runAllTests();
