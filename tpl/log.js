exports.get = (address) => `<!DOCTYPE HTML>
<html>
<head>
<meta charset="utf-8">
<title>NYAH Logs</title>
<style>
ul {
  display: list-item;
  list-style-type: square;
  margin-bottom: 1em;
  font-family: monospace;
  font-size: normal;
  color: #999;
}
li {
  display: block;
  white-space: pre-wrap;
  color: black;
}
</style>
<script>
var connection
window.addEventListener("load", function () {
connection = new WebSocket("ws://${address.ip}:${address.port}")
connection.onmessage = function (event) {
var li = document.createElement("li")
li.textContent = event.data
document.getElementsByTagName('ul')[0].prepend(li)
}
})
</script>
</head>

<body>
<ul></ul>
</body>
</html>`
