# 示例

这里列出一些常用的业务场景, 方便快速查找.
如果有需要后台接口的地方, 统一假设为 http://192.168.1.18:8080.

## 如何使后端的接口允许跨域
> 不需要配置 webpack, 不需要后端人员更改, 不需要浏览器插件

这个功能 mockm 默认是支持的, 以最简方式启动 mockm 就能拥有此功能, 只要在命令行输入下面这条命令即可.
``` sh
mm proxy=http://192.168.1.18:8080
```

你也可以使用配置文件的方式, 创建 `mm.config.js` 文件并录入以下内容, 然后命令行输入 `mm` 即可:

``` js
module.exports = {
  proxy: `http://192.168.1.18:8080`
}
```

然后更换原来的请求地址为自己的即可, 例如自己的 IP 为 192.168.1.17 则做以下更改:
- 更改前: http://192.168.1.18:8080/api/
- 更改后: http://192.168.1.17:9000/api/

## 如何创建一个自己的接口
> 与后端接口相同时, 会使用自己的

让我们以最简单的方式创建一个接口:

``` js
module.exports = {
  api: {
    '/my/api': {
      msg: `我的 api`
    },
  },
}
```
接口已完成, 访问 http://127.0.0.1:9000/my/api 查看效果.

详情请参考 [config.api](../config/option.md#config-api), 为了便于多人协作, 还能从浏览器里创建, 参考 [接口编辑](../use/webui.md#接口编辑).


## 如何从接口获取请求信息
当我们需要根据接口传入的值来返回不同的内容时, 也是很容易:

``` js
module.exports = {
  api: {
    '/my/value' (req, res) {
      // req.params 是 url 上的路径参数
      // req.query 是 url 上的查询参数
      // req.body 是请求体中的参数
      res.json({desc: `你传入的值`, data: req.query})
    },
  },
}
```

接下访问接口传入一些 url 参数测试一下 http://localhost:9000/my/value?city=上海 结果为:

``` json
{
  "desc": "你传入的值",
  "query": {
    "city": "上海"
  }
}
```

## 如何快速生成 Restful API
假设我要写一个博客文章的列表, 并且要实现添加文章, 查询文章, 分页, 模糊搜索, 删除, 修改等各种功能的接口. 那么只需添加以下内容:

``` js
module.exports = {
  db: {
    'blogs': [
      {
        id: 1,
        content: `mockm 是一款便于使用, 功能灵活的接口工具. 看起来不错~`,
        title: `认识 mockm 的第一天`,
      },
    ],
  },
}
```

这时候上面要实现的所有接口已经实现了. 
这里我用 http 作为请求工具简单表示几个功能, 你可以使用你喜欢的工具发送请求.

``` sh
# 查看 id 为 1 的博文详情
http :9000/blogs/1

# 创建一篇关于同事的文章
http post :9000/blogs title=同事的一天 content=今天他的生活还是同样的苦涩

# 获取所有文章
http :9000/blogs

# 查询所有含有 `苦涩` 的文章
http :9000/blogs?q=苦涩
```
::: details 接口请求结果
``` sh
# 查看 id 为 1 的博文详情
http :9000/blogs/1

{
  "code": 200,
  "data": {
    "content": "mockm 是一款便于使用, 功能灵活的接口工具. 看起来不错~",
    "id": 1,
    "title": "认识 mockm 的第一天"
  },
  "success": true
}

# 创建一篇关于同事的文章
http post :9000/blogs title=同事的一天 content=今天他的生活还是同样的苦涩

{
  "code": 200,
  "data": {
    "content": "今天他的生活还是同样的苦涩",
    "id": 2,
    "title": "同事的一天"
  },
  "success": true
}

# 获取所有文章
http post :9000/blogs

{
  "code": 200,
  "data": [
    {
      "content": "mockm 是一款便于使用, 功能灵活的接口工具. 看起来不错~",
      "id": 1,
      "title": "认识 mockm 的第一天"
    },
    {
      "content": "今天他的生活还是同样的苦涩",
      "id": 2,
      "title": "同事的一天"
    }
  ],
  "success": true
}

# 查询所有含有 `苦涩` 的文章
http post :9000/blogs?q=苦涩

{
  "code": 200,
  "data": [
    {
      "content": "今天他的生活还是同样的苦涩",
      "id": 2,
      "title": "同事的一天"
    }
  ],
  "success": true
}

```
:::

::: details 接口示例
所有的创建或修改都会像真实的后台接口把操作结果存储在数据库一样.

- 基本操作
GET    /books -- 获取所有
POST   /books -- 增加一条
GET    /books/1 -- 获取某条
PUT    /books/1 -- 修改某条
PATCH  /books/1 -- 部分修改某条
DELETE /books/1 -- 删除某条

- 过滤
GET /books?discount=1&type=js -- 不同字段查询
GET /books?id=1&id=2 -- 相同字段不同的值
GET /books?author.name=张三 -- 使用点查询深层数据

- 分页
GET /books?_page=2 -- 分页
GET /books?_page=2&_limit=5 -- 分页并指定每页数量

- 排序
GET /books?_sort=view&_order=asc -- 排序
GET /books?_sort=user,view&_order=desc,asc -- 多字段排序

- 截取
GET /books?_start=2&_end=5 -- 截取 _start 到 _end 之间的内容
GET /books?_start=20&_limit=10 -- 截取 _start 后面的 _limit 条内容

- 运算
GET /books?view_gte=3000&view_lte=7000 -- 范围  `_gte` `_lte`
GET /books?id_ne=1 -- 排除 `_ne`
GET /books?type_like=css|js -- 过滤器 `_like`, 支持正则

- 全文检索
GET /books?q=张三 -- 精确全文匹配

参考 [json-server](https://github.com/typicode/json-server).

:::

## 如何生成逼真的数据
[mockjs](http://mockjs.com/examples.html) 是一个不错的数据生成工具, mockm 默认集成了它, 下面用它生成一批用户信息.

::: warning 注意
`module.exports` 的值已经变成函数, 这样你可以从函数的参数中收到 [util 中提供的一系列的工具](../config/config_fn.md).
:::

``` js
module.exports = util => {
  return {
    db: {
      'users': util.libObj.mockjs.mock({
        'data|15-23': [ // 随机生成 15 至 23 条数据
          {
            'id|+1': 1, // id 从 1 开始自增
            name: `@cname`, // 随机生成中文名字
            'sex|1': [`男`, `女`, `保密`], // 性别从这三个选项中随机选择一个
          },
        ]
      }).data,
    },
  }
}
```

现在访问 http://localhost:9000/users 已经可以看到很多逼真的用户数据了.

## 如何更改后端返回的数据
> 很多时候后端不方便直接修改数据, 因为会涉及很多逻辑, 前端直接写在代码里既麻烦又容易引发问题.

假设后台接口 `http://192.168.1.18:8080/api/user` get 请求返回的数据是这样的:
``` js
{
    "code": 200,
    "data": {
        "books": [
            {
                "page": 52,
                "type": "css"
            },
            {
                "page": 26,
                "type": "js"
            }
        ],
        "name": "张三"
    },
    "success": true
}

```

如果要修改 books 索引为 1 的 type 为 html, 那么配置如下:
``` js
module.exports = {
  proxy: {
    '/': `http://192.168.1.18:8080`,
    '/api/user': [`data.books[1].type`, `html`], // 数组第一个参数是修改的路径, 第二个参数是修改后的值
  },
}
```

如果要直接替换整个返回值为 `html` , 可以这样:
``` js
module.exports = {
  proxy: {
    '/': `http://192.168.1.18:8080`,
    '/api/user': [`html`], // 如果只提供一个参数, 则直接替换
  },
}
```

更多操作方式请参考 [config.proxy](../config/option.md#config-proxy)

## 如何延迟后端接口的响应时间
示例延迟 http://192.168.1.18:8080/api/user 这个接口的响应时间为 5 秒之后:

``` js
module.exports = {
  proxy: {
    '/': `http://192.168.1.18:8080`,
    '/api/user': {
        mid (req, res, next) {
          setTimeout(next, 5000)
        },
    },
  },
}
```
## 如何创建一个下载文件的接口
实现一个文件下载接口 http://127.0.0.1:9000/file, 发送某文件给客户端.

``` js
module.exports = {
  api: {
    '/file' (req, res, next) {
      res.sendFile(`这里写要下载的文件路径`)
    },
  },
}
```

## 如何接收客户端上传的文件
实现一个 post 方法的文件上传接口 http://127.0.0.1:9000/file/upload, 文件上传后保存到临时目录, 并返回文件信息.

``` js
module.exports = util => {
  const {
    toolObj,
  } = util
  return {
    api: {
      async 'post /file/upload' (req, res, next) {
        const multiparty = await toolObj.generate.initPackge(`multiparty`)
        const form = new multiparty.Form()
        form.parse(req, (err, fields = [], files) => {
          const data = {fields, files, err}
          res.json(data) // 保存上传的文件并返回文件信息
        })
      },
    }
  }
}
```

## 如何实现动态的接口路径参数
实现一个接口 http://127.0.0.1:9000/status/code, 其中 code 的位置是一个动态参数, 并返回接收到的 code.

``` js
module.exports = {
  api: {
    '/status/:code' (req, res, next) {
      const {params, query, body} = req
      res.json({statusCode: params.code})
    },
  },
}
```

## 如何向后端展示接口参数
> 告别截图, 告别一问一答, 告别参数太多无法复制

默认情况下, 每次请求会生成一条链接在响应头中的 x-test-api 上, 把这个链接发给后端即可.

- 方法1
直接在启动 mockm 的命令行里可能看到.

- 方法2
在 http://127.0.0.1:9005 页面上的列表中查找.

- 方法3
如果你使用 chrome 开发工具, 可以在 Network 中找到请求的接口在 Response Headers 中找到 x-test-api.

## 如何远程使用接口
把 [config.remote](../config/option.md#config-remote) 设置为 true 就能拥有域名的和 https 证书的公网接口, 能够在微信公众号上使用, 或者发给其他人远程使用..

在控制台会显示 `远程服务信息`, x-test-api 和接口都会生成对应的远程访问链接.

## 如何接入微信消息推送
当 remote 设置为 true 后会获得一个远程地址, 将其带上接口 `/msg` 填入 `URL(服务器地址)` 中, token 填写例如 `123`, 数据格式推荐 `JSON`. 保存后即可验证通过, 所有微信小程序的消息都会通过 `/msg` 这个接口收到.

``` js
module.exports = {
  remote: true,
  api: {
    '/msg' (req, res) {
      const token = `123` // 这里填写 Token(令牌)
      const crypto = require(`crypto`)
      const { signature, timestamp, nonce, echostr, } = req.query
      const sha = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex')
      sha === signature ? res.send(echostr) : res.json({ msg: `验证失败` })
      console.log(req.query, req.body)
    },
  },
}
```

## 如何恢复出错的接口
如果某个接口之前是好的, 但是由于某些问题现在坏了, 后端又没来得及修复, 可是前端现在有页面依赖这个接口, 怎么办?

在 http://127.0.0.1:9000 选择对应接口的请求历史, 点击 fixed 即可.

## 如何在后端关闭时不影响页面
页面要展示的内容来源于数据, 如果后端服务器出现问题, 所有接口无法使用, 这时候修改请求地址为 http://127.0.0.1:9001 即可让页面使用之前服务器返回的数据.

## 如何使用多个主机不同的接口
如果某个项目需要用到两个接口, 例如分别在 `192.168.1.13:8098` 和 `192.168.1.13:8099`, 启动多个 mm 实例即可.

如果想要使用同一份配置文件, 只是接口地址不同, 那么只需要从命令行传入不同的部分即可:

``` sh
mm dataDir=./httpData/8081/ port=8081 replayPort=8181  testPort=8281 proxy=http://192.168.1.13:8081
mm dataDir=./httpData/8082/ port=8082 replayPort=8182  testPort=8282 proxy=http://192.168.1.13:8082
```

如果要使用不同的配置, 那么启动 mm 时传入配置文件路径即可, 然后再从配置文件中编写不同的部分:
``` sh
mm config=./8081.config.js
mm config=./8082.config.js
```

如果需要把两个接口合并为一个接口:
``` sh
# todo
```

## 一份包含大多数选项的配置文件
这是通过 `mm config` 生成的配置文件, 仅供参考, 包含了 mockm 的大部分选项及在各种业务场景下的示例, 不要被这么多配置吓到, 记住所有选项都可以不需要.

::: details 点击查看
@[code](@doc/../server/example.config.js)
:::
