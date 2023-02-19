const fs = require("fs");
const path = require("path");
const babylon = require("babylon");
const traverse = require("babel-traverse").default;
const { transformFromAst } = require("babel-core");

let id = 0;
/**
 *
 * @returns Danh sách các dependencies của file
 */
function createAsset(filename) {
  // Đọc nội dung file
  const content = fs.readFileSync(filename, "utf-8");

  // Lấy danh sách các dependecies của file bằng cách tìm các chỗ có chứ **import**
  // Nhưng thay vì làm việc với chuỗi, ta làm việc với ast (abstract syntax tree)

  // Chuyển code thành ast
  const ast = babylon.parse(content, {
    sourceType: "module",
  });

  const dependecies = [];

  // Duyệt qua từng node và kiểm tra xem có **import** không
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependecies.push(node.source.value);
    },
  });

  // Dùng babel để transpile ecmascript
  const { code } = transformFromAst(ast, null, { presets: ["env"] });

  return { id: id++, filename, dependecies, code };
}

/**
 *
 * @returns Graph quan hệ của các dependencies
 */
function createGraph(entry) {
  const mainAsset = createAsset(entry);
  const queue = [mainAsset];

  for (const asset of queue) {
    asset.mapping = {};
    const dirname = path.dirname(asset.filename);
    asset.dependecies.forEach((relativePath) => {
      // Tạo đường dẫn tuyệt đối của dependency từ đường dẫn của asset
      const absolutePath = path.join(dirname, relativePath);

      // Đọc nội dung file
      const child = createAsset(absolutePath);
      asset.mapping[relativePath] = child.id;
      queue.push(child);
    });
  }

  return queue;
}

/**
 *
 * @returns đóng gói thành 1 file để trình duyệt có thể thực thi được
 */
function bundle(graph) {
  let modules = "";
  graph.forEach((module) => {
    // Mỗi 1 module, tạo ra 1 cặp key value
    // key là id, value là 1 mảng gồm 2 giá trị:
    // Giá trị 1 là code của module được bao trong 1 hàm nhằm tránh xung đột tên biến với module khác
    // Giá trị 2 là 1 mapping có dạng {<đường dẫn>: <id>}
    modules += `${module.id}: [
      function(require, module, exports) {
        ${module.code}
      },
      ${JSON.stringify(module.mapping)}
    ],`;
  });

  const result = `
    (function(modules){
      function require(id) {
        const [fn, mapping] = modules[id];
        function localRequire(name) {
          return require(mapping[name]);
        }
        const module = { exports : {} };
        fn(localRequire, module, module.exports);
        return module.exports;
      }
      require(0);
    })({${modules}})
  `;

  return result;
}

const graph = createGraph("./entry.js");
const result = bundle(graph);
console.log(result);
