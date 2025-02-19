#!/usr/bin/env node

const {logHelper, print} = require('./util/log.js')
process.argv.includes(`dev`) && logHelper()
const config = require(`./config.js`)
const util = require(`./util/index.js`)

new Promise(async () => {
  const {
    toolObj,
    business,
  } = util
  const portIsOkRes = await (toolObj.os.portIsOk([config.port, config.testPort, config.replayPort])).catch(err => console.log(`err`, err))
  if(portIsOkRes.every(item => (item === true)) === false) {
    console.log(`端口被占用:`, portIsOkRes)
    process.exit()
  }

  const {isIp, hostname} =  config._proxyTargetInfo
  if(config.hostMode && (isIp === false)) {
    await toolObj.os.sysHost(`set`, {hostname})
    toolObj.os.clearProcess({hostname})
  } else {
    toolObj.os.clearProcess()
  }
  const {
    initHandle,
    reqHandle,
    clientInjection,
    historyHandle,
    customApi,
    reStartServer,
    listToData,
  } = business()
  const {
    allowCors,
  } = clientInjection({config})
  const {
    setHttpHistoryWrap,
    getHistory,
    getHistoryList,
    ignoreHttpHistory,
  } = historyHandle({config})
  const {
    sendReq,
  } = reqHandle({config})

  const {
    init,
    getOpenApi,
  } = initHandle()

  const {
    apiRootInjection,
    api,
    db,
  } = init({config})
  const {
    middleware,
    httpClient,
    url: {
      parseRegPath,
    },
  } = toolObj
  const {
    middlewares,
    middlewaresObj,
  } = middleware.getJsonServerMiddlewares({config})

  const {
    parseApi: {
      noProxyTest,
      serverRouterList,
    },
    getDataRouter,
    parseDbApi,
  } = customApi({api, db, config})

  const HTTPHISTORY = require(config._httpHistory) // 请求历史
  let TOKEN = ''

  const server = () => {
    const getProxyConfig = (userConfig = {}) => {
      const rootTarget = config.proxy.find(item => (item.context === `/`)).options.target
      const defaultConfig = {
        target: rootTarget,
        changeOrigin: true,
        onProxyReq: (proxyReq, req, res) => {
          allowCors({req: proxyReq, proxyConfig: userConfig})
          middlewaresObj.logger(req, res, () => {})
          middlewaresObj.jsonParser(req, res, () => {
            const {
              method,
              url,
            } = req
            if(ignoreHttpHistory({config, req}) === false) {
              // setHttpHistory(`${method} ${url}`, {req})
            }
          })
          TOKEN = req.get('Authorization') || TOKEN // 获取 token
        },
        onProxyRes: (proxyRes, req, res) => {
          allowCors({res: proxyRes, req})
          setHttpHistoryWrap({
            config,
            history: HTTPHISTORY,
            req,
            res: proxyRes,
          })
        },
        logLevel: `silent`,
      }
      // 为了默认注入一些功能, 例如历史记录功能, 需要把用户添加的函数与程序中的函数合并
      Object.keys(defaultConfig).forEach(key => {
        const defaultVal = defaultConfig[key]
        if(typeof(defaultVal) === `function`) {
          const userVal = userConfig[key] || (() => undefined)
          userConfig[key] = (...arg) => {
            defaultVal(...arg)
            return userVal(...arg)
          }
        }
      })
      return {
        ...defaultConfig,
        ...userConfig,
      }
    }

    const apiWebStore = toolObj.file.fileStore(config.apiWeb)
    const disableApiList = apiWebStore.get(`disable`)

    return {
      serverProxy() {
        const jsonServer = require('json-server')
        const proxy = require('http-proxy-middleware').createProxyMiddleware
        const server = jsonServer.create()
        server.use((req, res, next) => {
          next()
        })
        middleware.reWriteRouter({app: server, routes: config.route})
        const router = jsonServer.router(config.dbJsonPath)
        server.use(middlewaresObj.corsMiddleware)
        // disable = false 才走自定义 proxy
        config.disable === false && config.proxy.forEach(item => {
          if(item.context === `/` || config.hostMode) { // 过滤掉主 URL, 给后面的拦截器使用
            return false
          } else {
            // 在统一的中间件里判断经过 proxy 的路由是否也存在于自定义 api 中, 如果存在则不进入代理, 即当 proxy 和自定义 api 同时存在时, 后者优先
            function midHandler(fn) {
              return (req, res, next) => {
                const hasFind = serverRouterList.some(item => item.re.test(req.baseUrl))
                hasFind ? next() : fn(req, res, next)
              }
            }
            const mid = proxy(item.context, getProxyConfig(item.options))
            item.options.mid && server.use(item.context, midHandler(item.options.mid))
            server.use(item.context, midHandler(mid))
          }
        })
        server.use(proxy(
          (pathname, {method}) => { // 返回 true 时进行转发, 真实服务器
            method = method.toLowerCase()
            if(
              (config.disable === false) // disable = false 才走自定义 api
              && (config.hostMode || noProxyTest({method, pathname}) || getDataRouter({method, pathname, db}))
            ) {
              return false
            } else {
              return true
            }
          },
          {
            ...getProxyConfig(),
            target: config._proxyTargetInfo.origin,
          },
        ))

        server.use(middlewares) // 添加中间件, 方便取值
        server.use((req, res, next) => { // 修改分页参数, 符合项目中的参数
          req.query.page && (req.query._page = req.query.page)
          req.query.pageSize && (req.query._limit = req.query.pageSize)
          const {url, body, query, params} = req
          next()
        })
        server.use((req, res, next) => { // 保存自定义接口的请求历史
          const cloneDeep = require('lodash.clonedeep')
          const reqBody = cloneDeep(req.body) // 如果不 cloneDeep, 那么 req.body 到 send 回调中会被改变
          const oldSend = res.send
          res.send = (data = ``) => {
            res.send = oldSend
            setHttpHistoryWrap({
              config,
              history: HTTPHISTORY,
              req: {...req, body: reqBody},
              res,
              mock: true,
              buffer: typeof(data) === `object` ? data : Buffer.from(data),
            })
            return res.send(data)
          }
          next()
        })

        // 前端自行添加的测试 api
        server.use(apiRootInjection)
        serverRouterList.forEach(({method, router, action}) => {
          server[method](router, action)
        })

        server.use(router) // 其他 use 需要在此行之前, 否则无法执行

        server.listen(config.port, () => {
          // console.log(`服务运行于: http://localhost:${config.port}/`)
        })

        router.render = (req, res) => { // 修改输出的数据, 符合项目格式
          // 在 render 方法中, req.query 会被删除
          // https://github.com/typicode/json-server/issues/311
          // https://github.com/typicode/json-server/issues/314

          const querystring = require('querystring')
          if(req._parsedUrl) {
            const query = querystring.parse(req._parsedUrl.query)
            req.query = query
          }
          let returnData = res.locals.data // 前面的数据返回的 data 结构
          const xTotalCount = res.get('X-Total-Count')
          if(xTotalCount) {
            returnData = {
              count: xTotalCount,
              results: res.locals.data,
            }
          }
          res.json(config.resHandleJsonApi({req, res, data: returnData}))
        }

      },
      serverTest() {
        const jsonServer = require('json-server')
        const serverTest = jsonServer.create()
        serverTest.use(middlewaresObj.corsMiddleware)
        serverTest.use(middlewaresObj.jsonParser)
        serverTest.use(middleware.compression())

        serverTest.get(`*`, (req, res, next) => {
          let {path} = httpClient.getClientUrlAndPath(req.originalUrl)
          if(path.match(/^\/api\//)) { // 为 /api/ 则视为 api, 否则为静态文件
            next()
          } else {
            path = path === `/` ? `/index.html` : path // 访问 / 时默认返回 index.html
            const filePath = require(`path`).resolve(__dirname, `./page/${path}`)
            res.sendFile(filePath, err => {
              if (err) {
                res.status(404).send({msg: `文件未找到: ${path}`})
              }
            })
          }
        })

        serverTest.get(`/api/:actionRaw/:api0(*)`, (req, res, next) => { // 给后端查询前端请求的接口
          let {actionRaw, api0} = parseRegPath(req.route.path, req.url)

          const [action, ...actionArg] = actionRaw.split(`,`)
          api0 = `/${api0}`
          const [, method, api] = api0.match(/\/(\w+)(.*)/) || []
          const urlData = {actionRaw, action, actionArg, api0, method, api}
          const actionArg0 = actionArg[0]
          const fullApi = api ? `${method} ${api}` : undefined

          function getFilePath({reqOrRes, id}) {
            try {
              const httpData = getHistory({history: HTTPHISTORY, fullApi, id}).data[reqOrRes]
              if(reqOrRes === `res`) { // 模仿 res 中的响应头, 但是开启跨域
                res.set(httpData.lineHeaders.headers)
                allowCors({res, req})
              }
              const path = require('path')
              if(toolObj.file.hasFile(httpData.bodyPath)) {
                res.sendFile(path.resolve(httpData.bodyPath))
              } else {
                throw new Error(`不存在文件 ${httpData.bodyPath}`)
              }
            } catch (err) {
              console.log('err', {api, err})
              res.status(404).json({msg: err.message})
            }
          }
          const actionFnObj = {
            getApiList() {

              const list = getHistoryList({history: HTTPHISTORY})
              let {
                _sort = ``,
                _order = ``,
                _page = 1,
                _limit = 10,
              } = req.query
              _sort = _sort.split(`,`)
              _order = _order.split(`,`)
              if(_sort[0] === `id`) { // 把 id 转换为数字, 这样 orderBy 才能进行比较
                _sort[0] = item => Number(toolObj.hex.string62to10(item.id))
              }
              if(_sort[0] === `date`) {
                _sort[0] = item => new Date(item.date).getTime()
              }
              const page = _page;
              const limit = _limit;
              const orderBy = require(`lodash.orderby`);
              const drop = require(`lodash.drop`);
              const take = require(`lodash.take`);
              const results = take(
                drop(
                  orderBy(
                    list,
                    _sort, _order,
                  ),
                  (page - 1) * limit,
                ),
                limit,
              )
              const sendData = {
                count: list.length,
                results,
              }
              res.send(sendData)
            },
            getApiHistry(apiId) {
              const list = getHistoryList({history: HTTPHISTORY, method, api})
              res.send(list)
            },
            getOpenApi() {
              const api = req.query.api
              const openApi = {
                string: () => config.openApi, // 字符串时, 直接返回
                array: () => { // 数组时, 返回 pathname 匹配度最高的项
                  const pathname = new URL(`http://127.0.0.1${api}`).pathname
                  return toolObj.url.findLikeUrl({
                    urlList: config.openApi,
                    pathname,
                  })
                },
                object: () => { // 对象时, 以 `new RegExp(key, 'i').test(pathname)` 的形式匹配
                  const pathname = new URL(`http://127.0.0.1${api}`).pathname
                  let firstKey = ``
                  const key = Object.keys(config.openApi).find(key => {
                    if (firstKey === ``) { // 把第一个 key 保存起来, 当没有找到对应的 key 时则把它作为默认的 key
                      firstKey = key
                    }
                    const re = new RegExp(key, `i`)
                    return re.test(pathname)
                  })
                  return config.openApi[key || firstKey]
                },
              }[toolObj.type.isType(config.openApi)]()
              getOpenApi({openApi}).then(oepnApiData => {
                res.send(oepnApiData)
              }).catch(err => console.log(`err`, err))
            },
            getApiListSse() {
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
              })
              res.write("retry: 10000\n")
              res.write("event: message\n")
              let oldSize = -1
              const interval = setInterval( () => {
                const fs = require(`fs`)
                fs.stat(config._httpHistory, (err, stats) => { // 不用全部读取文件即可读取文件大小信息, 减少内存占用
                  if (err) {
                    return console.error(err);
                  }
                  if(stats.size !== oldSize) {
                    const str = JSON.stringify(getHistoryList({history: HTTPHISTORY}))
                    res.write(`data:${str}\n\n`)
                    res.flush()
                    oldSize = stats.size
                  }
                })
              }, 500)

              req.connection.addListener("close",  () => {
                clearInterval(interval);
              }, false);
            },
            replay() {
              sendReq({
                token: TOKEN,
                getHistory,
                history: HTTPHISTORY,
                api: fullApi,
                res,
                apiId: actionArg0,
              })
            },
            getBodyFileReq() {
              getFilePath({reqOrRes: `req`, id: actionArg0})
            },
            getBodyFileRes() {
              getFilePath({reqOrRes: `res`, id: actionArg0})
            },
            getHttpData() {
              const historyRes = getHistory({history: HTTPHISTORY, fullApi, id: actionArg0})
              if(historyRes.data) {
                const {method, path} = historyRes.data.req.lineHeaders.line
                const webApi = (apiWebStore.get([`paths`, path]) || {})[method]
                if(webApi) {
                  webApi.disable = apiWebStore.get(`disable`).includes(historyRes.fullApi)
                }
                res.send({
                  webApi,
                  historyRes,
                })
              } else {
                res.status(404).send({
                  msg: `记录不存在`,
                })
              }
            },
            getApiResponseById() {
              middleware.replayHistoryMiddleware({
                id: actionArg0,
                HTTPHISTORY,
                config,
              })(req, res, next)
            },
            getConfig() {
              res.send(config)
            },
            getStore() {
              const str = require(`fs`).readFileSync(config._store, `utf8`)
              res.json(JSON.parse(str))
            },
            studio() {
              let path = req.query.path
              const apiWebStore = toolObj.file.fileStore(config.apiWeb)
              const apiWeb = apiWebStore.get(path ? [`paths`, path] : `paths`) || {}
              if(path) { // 获取单条
                res.json(apiWeb)
              } else { // 获取列表
                let sendData = []
                const disableApiList = apiWebStore.get(`disable`)
                const {
                  api,
                  db,
                } = init({config}) // 重新运行初始化方法, 以读取最新的 db 和 webApi 文件
                const {
                  parseApi: {
                    serverRouterList,
                  },
                } = customApi({api, db, config})
                serverRouterList.forEach(item => { // 来自 config.apiWeb 和 config.api
                  sendData.push({
                    path: item.router,
                    method: item.method,
                    type: item.action.type || `api`,
                    description: item.action.description,
                    disable: item.action.disable,
                  })
                })
                sendData = sendData.concat(parseDbApi) // 来自 config.db
                res.json({api: sendData, disable: disableApiList})
              }
            },
          }
          if (actionFnObj[action]) {
            actionFnObj[action](...actionArg)
          } else {
            console.log(`无匹配方法`, {action, api, method})
            next()
          }
        })

        serverTest.patch(`/api/:actionRaw/:api0(*)`, (req, res, next) => {
          let {actionRaw, api0} = parseRegPath(req.route.path, req.url)
          const [action, ...actionArg] = actionRaw.split(`,`)
          const actionFnObj = {
            studio() {
              const {setPath, data} = req.body
              const oldVal = apiWebStore.get(setPath)
              apiWebStore.set(setPath, {...oldVal, ...data})
              res.json({msg: `ok`})
              reStartServer(config.config)
            },
          }
          if (actionFnObj[action]) {
            actionFnObj[action]()
          } else {
            console.log(`无匹配方法`, {action})
            next()
          }
        })

        serverTest.post(`/api/:actionRaw/:api0(*)`, (req, res, next) => {
          let {actionRaw, api0} = parseRegPath(req.route.path, req.url)
          const [action, ...actionArg] = actionRaw.split(`,`)
          const actionFnObj = {
            listToData() {
              const {table, rule, type} = req.body
              const listToDataRes = listToData(table, {rule, type})
              res.json(listToDataRes.data)
            },
            async translate() {
              const {text, appid, key, type = `tree`} = req.body
              const { batchTextEnglish } = require(`./util/translate`)
              batchTextEnglish({
                text,
                appid,
                key,
                type,
              }).then(data => {
                res.json(data)
              }).catch(err => {
                res.json({err: err.message})
              })
            },
            removeApi() {
              const {setPath} = req.body
              apiWebStore.set(setPath, undefined)
              res.json({msg: `ok`})
              reStartServer(config.config)
            },
            changeWebApiStatus() {
              const {api} = req.body
              const findIndexRes = disableApiList.findIndex(item => item === api)
              if(findIndexRes >= 0) {
                disableApiList.splice(findIndexRes, 1)
              } else {
                disableApiList.push(api)
              }
              apiWebStore.set(`disable`, disableApiList)
              reStartServer(config.config)
              res.json({msg: `ok`})
            },
          }
          if (actionFnObj[action]) {
            actionFnObj[action]()
          } else {
            console.log(`无匹配方法`, {action})
            next()
          }
        })

        serverTest.listen(config.testPort, () => {
          // console.log(`接口调试地址: http://localhost:${config.testPort}/`)
        })

      },
      serverReplay() {
        const jsonServer = require('json-server')
        const proxy = require('http-proxy-middleware').createProxyMiddleware
        const serverReplay = jsonServer.create()
        middleware.reWriteRouter({app: serverReplay, routes: config.route})
        serverReplay.use(middlewaresObj.corsMiddleware)
        serverReplay.use(proxy(
          (pathname, req) => {
            const method = req.method.toLowerCase()
            const fullApi = `${method} ${req.originalUrl}`
            const history = getHistory({history: HTTPHISTORY, fullApi}).data
            if(history || config.hostMode) { // 当存在 history 则不进入代理
              return false
            } else if(noProxyTest({method, pathname}) === true) { // 当没有 history, 则使用 noProxy 规则
              return true
            } else { // 当没有 history 也不匹配 noProxy 时, 则根据 replayProxy 规则
              return config.replayProxy
            }
          },
          {
            target: `http://localhost:${config.port}/`,
            logLevel: `silent`,
          },
        ))
        serverReplay.use(middlewares)
        serverReplay.use(middleware.replayHistoryMiddleware({
          HTTPHISTORY,
          config,
        }))
        serverReplay.listen(config.replayPort, () => {
          // console.log(`服务器重放地址: http://localhost:${config.replayPort}/`)
        })

      }
    }
  }

  const serverObj = server()

  serverObj.serverProxy()
  serverObj.serverTest()
  serverObj.serverReplay()

})
