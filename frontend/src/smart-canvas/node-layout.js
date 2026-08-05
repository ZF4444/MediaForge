// 从 static/js/smart-canvas.js 剪切出的节点布局计算逻辑（M3 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1 utils.js / M2 loop-node.js
// 同一个原因）：smart-canvas.js 依赖经典 <script> 的全局作用域语义（顶层
// 声明自动挂到 window），static/smart-canvas.html 里 57 处内联
// onclick="xxx()" 都依赖这一点。所以这里同样只做"物理文件拆分"：
// node-layout.js 保持经典脚本语法，通过 <script src="node-layout.js">
// 排在 loop-node.js 之后、node-model.js 和 main.js 之前加载。
//
// 依赖的外部全局（都还留在 static/js/smart-canvas.js / main.js 里，
// 通过共享全局作用域访问，未随本文件迁移）：
//   类型判断：isSmartImageNode（node-layout.js 里多处用来判断是否走
//     "显式尺寸"分支，本身是节点类型判断，留在 main.js）
//   分组成员查询：smartGroupMembers, smartGroupCompactMembers,
//     smartGroupImageRefs（读取 node.items/图组结构，属于节点数据模型/
//     图结构查询，不是布局计算，留在 main.js）
//   循环节点尺寸：smartLoopWidth, smartLoopHeight（M2 已拆到
//     loop-node.js，同样是经典脚本挂全局，node-layout.js 里的 imageLayout
//     会调用它们）
//   常量：MEDIA_NODE_DEFAULT_SCALE, MEDIA_GROUP_DEFAULT_SCALE,
//     MEDIA_GROUP_THUMB_BASE, EMPTY_GENERATION_NODE_WIDTH,
//     EMPTY_GENERATION_NODE_HEIGHT, SMART_GROUP_DEFAULT_WIDTH,
//     SMART_GROUP_DEFAULT_HEIGHT, SMART_GROUP_LEGACY_HEIGHT,
//     SMART_GROUP_MIN_WIDTH, SMART_GROUP_MIN_HEIGHT
//   工具函数（M1 已拆到 utils.js）：escapeHtml
//   其他渲染辅助：inputThumbType, inputThumbLabel, isAudioMediaItem,
//     isVideoMediaItem, videoPosterHtml（smartNodeInputThumbsHtml 用到，
//     属于媒体缩略图渲染细节，留在 main.js）
//
// 反过来，main.js 里仍保留的以下函数会调用本文件里的布局函数
// （通过共享全局作用域，未做任何改动）：几乎所有渲染/节点操作相关函数
// 都会用到 nodeRect/imageLayout 计算节点尺寸和位置。
//
// 刻意排除（留在 main.js，属于其他模块的范畴）：
//   arrangeSmartGroupMembers —— 这是一个会调用 pushUndo() 并直接修改
//   节点 x/y/w/h 的"排列命令"，不是纯布局计算，且依赖分组成员查询
//   （smartGroupMembers 等），更接近未来 connections.js/分组操作 的范畴。

function safeScale(value){
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
}
function nodeScale(node){
    if(isSmartImageNode(node) || !node?.type) return mediaNodeDefaultScale(node);
    return 1;
}
function mediaNodeDefaultScale(node){
    return (node?.images || []).length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE;
}
function smartGroupLayoutSize(node){
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    const width = Number.isFinite(explicitW) && explicitW >= SMART_GROUP_MIN_WIDTH ? explicitW : SMART_GROUP_DEFAULT_WIDTH;
    const height = !Number.isFinite(explicitH) || explicitH === SMART_GROUP_LEGACY_HEIGHT
        ? SMART_GROUP_DEFAULT_HEIGHT
        : Math.max(explicitH, SMART_GROUP_MIN_HEIGHT);
    return {width:Math.round(width), height:Math.round(height)};
}
function smartGroupThumbLayout(node){
    const refs = smartGroupImageRefs(node).filter(ref => ref.item?.url);
    if(!refs.length) return null;
    const compactMembers = smartGroupCompactMembers(node);
    const count = refs.length + compactMembers.length;
    const items = refs.map(ref => ref.item);
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    const hasExplicit = Number.isFinite(explicitW) && explicitW >= SMART_GROUP_MIN_WIDTH
        && Number.isFinite(explicitH) && explicitH >= SMART_GROUP_MIN_HEIGHT;
    const scale = mediaNodeDefaultScale({type:'smart-image', images:items, scale:node?.scale});
    const summarySpace = 28;
    const outerPad = 32;
    if(count === 1){
        if(hasExplicit){
            return {
                refs,
                compactMembers,
                cols:1,
                rows:1,
                visibleRows:1,
                width:Math.round(explicitW),
                height:Math.round(explicitH),
                thumb:Math.round(96 * scale),
                single:true,
                innerW:Math.max(24, Math.round(explicitW - outerPad)),
                innerH:Math.max(24, Math.round(explicitH - outerPad - summarySpace))
            };
        }
        const single = singleImageLayout(refs[0].item, {}, scale);
        return {
            refs,
            compactMembers,
            ...single,
            width:Math.max(SMART_GROUP_MIN_WIDTH, Math.round(single.width + outerPad)),
            height:Math.max(SMART_GROUP_MIN_HEIGHT, Math.round(single.height + outerPad + summarySpace)),
            innerW:single.width,
            innerH:single.height
        };
    }
    const gap = 8;
    const thumb = Math.round(MEDIA_GROUP_THUMB_BASE * scale);
    const cell = thumb + gap;
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / cols);
    const gridW = cols * thumb + (cols - 1) * gap;
    const gridH = rows * cell - gap;
    return {
        refs,
        compactMembers,
        cols,
        rows,
        visibleRows:rows,
        thumb,
        width:Math.max(SMART_GROUP_MIN_WIDTH, Math.round(gridW + outerPad)),
        height:Math.max(SMART_GROUP_MIN_HEIGHT, Math.round(gridH + outerPad + summarySpace))
    };
}
function singleImageLayout(image, node, scale){
    const useExplicitSize = node && !isSmartImageNode(node);
    const explicitW = useExplicitSize ? Number(node?.w) : NaN;
    const explicitH = useExplicitSize ? Number(node?.h) : NaN;
    if(Number.isFinite(explicitW) && explicitW > 24 && Number.isFinite(explicitH) && explicitH > 24){
        return {cols:1, rows:1, width:Math.round(explicitW), height:Math.round(explicitH), thumb:Math.round(96 * scale), single:true};
    }
    const naturalW = Number(image?.natural_w || image?.width || 0);
    const naturalH = Number(image?.natural_h || image?.height || 0);
    if(naturalW > 0 && naturalH > 0){
        const maxW = 260 * scale;
        const maxH = 220 * scale;
        const fit = Math.min(maxW / naturalW, maxH / naturalH);
        return {
            cols:1,
            rows:1,
            width:Math.max(72, Math.round(naturalW * fit)),
            height:Math.max(72, Math.round(naturalH * fit)),
            thumb:Math.round(96 * scale),
            single:true
        };
    }
    return {cols:1, rows:1, width:Math.round(260*scale), height:Math.round(180*scale), thumb:Math.round(96*scale), single:true};
}
function groupImageGridLayout(count, explicitW, explicitH, maxThumb, pad=32, gap=8, maxVisibleRows=3){
    let best = null;
    for(let cols = 1; cols <= count; cols++){
        const rows = Math.ceil(count / cols);
        const visibleRows = Math.min(Math.max(1, maxVisibleRows), rows);
        const availableW = explicitW - pad - (cols - 1) * gap;
        const availableH = explicitH - pad - (visibleRows - 1) * gap;
        if(availableW <= 0 || availableH <= 0) continue;
        const rawThumb = Math.floor(Math.min(availableW / cols, availableH / visibleRows));
        const fittedThumb = Math.max(28, Math.min(maxThumb, rawThumb));
        const fits = rawThumb >= 28;
        const usedW = cols * fittedThumb + (cols - 1) * gap + pad;
        const usedH = visibleRows * fittedThumb + (visibleRows - 1) * gap + pad;
        const spareW = Math.max(0, explicitW - usedW);
        const spareH = Math.max(0, explicitH - usedH);
        const atMax = fittedThumb >= maxThumb;
        const score = [
            fits ? 1 : 0,
            fittedThumb,
            atMax ? cols : 0,
            -(spareW + spareH * 0.35),
            -rows
        ];
        let better = !best;
        if(best){
            for(let i = 0; i < score.length; i++){
                if(score[i] === best.score[i]) continue;
                better = score[i] > best.score[i];
                break;
            }
        }
        if(better){
            best = {cols, rows, visibleRows, thumb:fittedThumb, score};
        }
    }
    const fallbackCols = Math.min(count, 2);
    const fallbackRows = Math.ceil(count / fallbackCols);
    return best || {cols:fallbackCols, rows:fallbackRows, visibleRows:Math.min(Math.max(1, maxVisibleRows), fallbackRows), thumb:28};
}
function smartNodeInputThumbRows(count){
    if(!count) return 0;
    // 最多展示 10 个缩略图；超过时会多出一个「+N」框，需额外占一格参与换行计算。
    const displayCount = count > 10 ? 11 : count;
    return Math.ceil(displayCount / 5);
}
function smartNodeInputThumbsHeight(images){
    const rows = smartNodeInputThumbRows((images || []).length);
    return rows ? rows * 44 + (rows - 1) * 6 + 8 : 0;
}
function smartNodeInputThumbsHtml(images, opts={}){
    const refs = (images || []).filter(img => img?.url);
    if(!refs.length) return '';
    const limit = Math.min(10, refs.length);
    const typeIndexes = {image:0, video:0, audio:0};
    const items = refs.slice(0, limit).map((img, index) => {
        const type = inputThumbType(img);
        const typeIndex = typeIndexes[type]++;
        const label = opts.labelPrefix ? `${opts.labelPrefix}${index + 1}` : inputThumbLabel(img, typeIndex);
        const media = isAudioMediaItem(img)
            ? `<div class="media-thumb audio-thumb"><i data-lucide="file-audio"></i><span>${escapeHtml(img.name || 'Audio')}</span></div>`
            : isVideoMediaItem(img)
            ? videoPosterHtml(img)
            : `<img src="${escapeHtml(img.url)}" alt="">`;
        return `<div class="smart-node-input-thumb" title="${escapeHtml(label)}">${media}<span class="smart-node-input-badge">${escapeHtml(label)}</span></div>`;
    }).join('');
    const more = refs.length > limit ? `<div class="smart-node-input-thumb smart-node-input-more">+${refs.length - limit}</div>` : '';
    return `<div class="smart-node-input-thumbs">${items}${more}</div>`;
}
function promptNodeLayoutSize(node){
    const oldCollapsedH = 230;
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    const width = !Number.isFinite(explicitW) || explicitW === 360 ? 316 : explicitW;
    // LLM 控件已移入浮层配置框，节点本体不再随之展开，保持收起高度。
    const fallbackH = 194;
    const legacyExpandedHeights = [292, 340, 344, 400];
    const height = !Number.isFinite(explicitH) || explicitH === oldCollapsedH || legacyExpandedHeights.includes(explicitH)
        ? fallbackH
        : Math.max(explicitH, fallbackH);
    return {width:Math.round(width), height:Math.round(height)};
}
function imageLayout(images, scale=1, node=null){
    if(node?.type === 'smart-group'){
        const groupThumbLayout = smartGroupThumbLayout(node);
        if(groupThumbLayout) return groupThumbLayout;
        return {cols:1, rows:1, ...smartGroupLayoutSize(node), thumb:96, single:true};
    }
    if(node?.type === 'smart-prompt') return {cols:1, rows:1, ...promptNodeLayoutSize(node), thumb:96, single:true};
    if(node?.type === 'smart-loop') return {cols:1, rows:1, width:Math.round(Number(node.w) || smartLoopWidth(node)), height:Math.round(Math.max(Number(node.h) || 0, smartLoopHeight(node))), thumb:96, single:true};
    const count = (images || []).length;
    const s = node?.type === 'smart-image' || !node?.type ? mediaNodeDefaultScale(node) : (Number.isFinite(scale) && scale > 0 ? scale : 1);
    if(count === 0){
        const pending = Number(node?.pending) > 0 || Boolean(node?.queued);
        const explicitW = pending ? Number(node?.w) : NaN;
        const explicitH = pending ? Number(node?.h) : NaN;
        const fallbackW = pending ? 260 * s : EMPTY_GENERATION_NODE_WIDTH;
        const fallbackH = pending ? 180 * s : EMPTY_GENERATION_NODE_HEIGHT;
        return {
            cols:1,
            rows:1,
            width:Math.round(Number.isFinite(explicitW) && explicitW > 24 ? explicitW : fallbackW),
            height:Math.round(Number.isFinite(explicitH) && explicitH > 24 ? explicitH : fallbackH),
            thumb:Math.round(96*s),
            single:true
        };
    }
    if(count === 1) return singleImageLayout(images[0], node, s);
    const thumb = Math.round(MEDIA_GROUP_THUMB_BASE * s);
    const cell = thumb + 8;
    const PAD = 32; // group-node has 16px padding on each side
    const grid = images.find(img => img?.grid?.type === 'grid-split')?.grid;
    const useExplicitSize = node && !isSmartImageNode(node);
    const explicitW = useExplicitSize ? Number(node?.w) : NaN;
    const explicitH = useExplicitSize ? Number(node?.h) : NaN;
    if(grid){
        const cols = Math.max(1, Number(grid.cols || 1));
        const rows = Math.max(1, Number(grid.rows || 1));
        if(Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40){
            const fittedThumb = Math.max(28, Math.floor(Math.min((explicitW - PAD - (cols - 1) * 8) / cols, (explicitH - PAD - (rows - 1) * 8) / rows)));
            return {cols, rows, width:Math.round(explicitW), height:Math.round(explicitH), thumb:fittedThumb};
        }
        return {cols, rows, width:Math.max(Math.round(226*s), cols * cell + PAD), height:rows * cell + PAD, thumb};
    }
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / cols);
    if(Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40){
        const fitted = groupImageGridLayout(count, explicitW, explicitH, thumb, PAD, 8);
        return {cols:fitted.cols, rows:fitted.rows, width:Math.round(explicitW), height:Math.round(explicitH), thumb:fitted.thumb};
    }
    const width = Math.max(Math.round(226*s), cols * cell + PAD);
    const height = rows * cell + PAD;
    return {cols, rows, width, height, thumb};
}
function nodeRect(node){
    const layout = imageLayout(node.images || [], nodeScale(node), node);
    return {x:node.x || 0, y:node.y || 0, width:layout.width, height:layout.height};
}
