const SHEET_NAME = 'CMF回覆';
const HEADERS = ['時間','姓名','整體滿意度','行程安排與節奏','交通與接駁安排','住宿安排','餐食安排','CMF課程與會場體驗','最有印象的三堂課','旅程回饋','2027長沙CMF意願','留言對象','公開留言','提交ID'];
const CHOICES = ['非常願意','有意願，視日期與費用而定','還不確定','意願不高','不會參加'];
const COURSES = ['百歲時代｜尹燁','自媒體事件營銷｜張一凡','壽險常青樹｜褚東東','家辦思維｜余巧琴','家企風險隔離｜國旭','認知突圍｜李偉彬','長期主義｜于忠濱','團隊文化｜王利忠','00後組織發展｜吳修毅','投保心理學｜羅淑瓊','企業家銷售邏輯｜曹紀平','高客服務與面談｜錢文曦','IP打造與直播獲客｜李揚','2026資產配置｜林海川','績優與高客深度經營｜趙楊','四個財務思維｜齊昊','保險的智慧｜王辰'];
const RATING_LABELS = ['整體滿意度','行程安排與節奏','交通與接駁安排','住宿安排','餐食安排','CMF課程與會場體驗'];

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('請從 Google 試算表的「擴充功能 → Apps Script」建立此專案');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  const sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#dff3f7');
  sheet.setFrozenRows(1);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse((e.parameter && e.parameter.payload) || '{}');
    const submissionId = String(data.submissionId || '').trim();
    if (!submissionId) throw new Error('Missing submission ID');
    if (!CHOICES.includes(data['2027長沙CMF意願'])) throw new Error('Invalid vote');
    if (!String(data['公開留言'] || '').trim()) throw new Error('Message required');
    const sheet = getSheet_();
    if (findSubmissionRow_(sheet, submissionId)) return json_({ok:true,duplicate:true,submissionId:submissionId});
    sheet.appendRow([
      new Date(), clean_(data['姓名'] || '匿名旅伴'), clean_(data['整體滿意度']),
      clean_(data['行程安排與節奏']), clean_(data['交通與接駁安排']), clean_(data['住宿安排']),
      clean_(data['餐食安排']), clean_(data['CMF課程與會場體驗']), clean_(data['最有印象的三堂課']),
      clean_(data['旅程回饋']), clean_(data['2027長沙CMF意願']), clean_(data['留言對象'] || '大家'),
      clean_(String(data['公開留言']).slice(0,120)), clean_(submissionId)
    ]);
    SpreadsheetApp.flush();
    return json_({ok:true,submissionId:submissionId});
  } catch (error) {
    return json_({ok:false,error:String(error.message || error)});
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const callback = String((e.parameter && e.parameter.prefix) || 'callback').replace(/[^a-zA-Z0-9_$]/g,'') || 'callback';
  let payload;
  try {
    if (e.parameter && e.parameter.action === 'status') {
      const id = String(e.parameter.id || '');
      payload = {ok:true,saved:!!findSubmissionRow_(getSheet_(),id)};
    } else {
      payload = getPublicResults_();
    }
  } catch (error) {
    payload = {ok:false,error:String(error.message || error)};
  }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getPublicResults_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const results = Object.fromEntries(CHOICES.map(choice => [choice,0]));
  const courses = Object.fromEntries(COURSES.map(course => [course,0]));
  const ratingTotals = RATING_LABELS.map(() => ({sum:0,count:0,distribution:{1:0,2:0,3:0,4:0,5:0}}));
  if (lastRow < 2) return emptyResults_(results,courses);
  const rows = sheet.getRange(2,1,lastRow-1,HEADERS.length).getValues();
  const messages = [], feedbacks = [];
  rows.forEach(row => {
    RATING_LABELS.forEach((label,index) => {
      const score = Number(row[index+2]);
      if (score >= 1 && score <= 5) {
        ratingTotals[index].sum += score; ratingTotals[index].count++; ratingTotals[index].distribution[score]++;
      }
    });
    String(row[8] || '').split('、').forEach(course => { if (course in courses) courses[course]++; });
    if (row[9]) feedbacks.push({name:String(row[1] || '匿名旅伴'),text:String(row[9]),time:formatTime_(row[0])});
    if (CHOICES.includes(row[10])) results[row[10]]++;
    if (row[12]) messages.push({name:String(row[1] || '匿名旅伴'),to:String(row[11] || '大家'),message:String(row[12]),time:formatTime_(row[0])});
  });
  const ratings = {};
  RATING_LABELS.forEach((label,index) => {
    const item = ratingTotals[index];
    ratings[label] = {label:label,avg:item.count ? Math.round(item.sum/item.count*10)/10 : 0,count:item.count,distribution:item.distribution};
  });
  return {ok:true,total:rows.length,updatedAt:new Date().toISOString(),results:results,messages:messages.reverse(),stats:{ratings:ratings,courses:courses,feedbacks:feedbacks.reverse()}};
}

function emptyResults_(results,courses) {
  return {ok:true,total:0,updatedAt:new Date().toISOString(),results:results,messages:[],stats:{ratings:{},courses:courses,feedbacks:[]}};
}

function findSubmissionRow_(sheet,id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2,14,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).findNext();
  return finder ? finder.getRow() : 0;
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('尚未執行 setup()');
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  if (sheet.getLastColumn() < HEADERS.length) sheet.insertColumnsAfter(sheet.getLastColumn(),HEADERS.length-sheet.getLastColumn());
  sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function clean_(value) {
  const text = String(value == null ? '' : value).trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function formatTime_(value) {
  if (!(value instanceof Date)) return '';
  return Utilities.formatDate(value,'Asia/Taipei','M/d HH:mm');
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
