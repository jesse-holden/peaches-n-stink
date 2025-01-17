const express = require('express')
const argon2 = require('argon2')
const {body, validationResult} = require('express-validator')
const db = require('../db')
const myMisc = require('../misc.js')

const router = express.Router()
const regexUsername = /^[a-z0-9-]{4,16}$/i
const htmlTitleHome = "Peaches 'n' Stink"
const htmlTitleSignUp = 'Sign Up'
const htmlTitleLogin = 'Log In'
const htmlTitleSettings = 'Settings'
const htmlTitleNewPost = 'New Post'
const htmlTitleEditPost = 'Edit Post'
const htmlTitleEditComment = 'Edit Comment'
const htmlTitleComment = 'Comment #'
const htmlTitleManual = 'Manual'
const cookieMaxAge = 1000*60*60*24*365*10;
const eyesDefaultUsername = 'stink'

// every request
function sharedAllHandler(req, res, next) {

    //
    if(parseInt(process.env.IS_PROD) === 1) {
        let host = req.headers.host;

        if(!host.match(/^www\..*/i)) {
            return res.redirect(301, req.protocol + '://www.' + host + req.originalUrl)
        }
    }

    next()
}

router.route('*')
    .get(sharedAllHandler)
    .post(sharedAllHandler)

//
router.route('/')
    .get(async (req, res) => {
        let finalUserId = req.session.user ? req.session.user.user_id : -1

        //
        let page = 1

        if(typeof req.query.p !== 'undefined') {
            page = parseInt(req.query.p)

            if(isNaN(page)) {
                return res.redirect('/')
            }
        }

        //
        const isDiscoverMode = isDiscover(req)
        const filterUserId = await getCurrEyesId(req)

        //
        const {rows} = await db.getPosts(
            finalUserId,
            myMisc.getCurrTimeZone(req),
            page,
            isDiscoverMode,
            filterUserId)

        res.render(
            'posts2',
            {
                html_title: htmlTitleHome,
                user: req.session.user,
                posts: rows,
                page: page,
                base_url: '/',
                is_discover_mode: isDiscoverMode,
                max_width: getCurrSiteMaxWidth(req)
            })
    })

router.route('/manual')
    .get((req, res) => {
        res.render(
            'instruction-manual',
            {
                html_title: htmlTitleManual,
                user: req.session.user,
                max_width: getCurrSiteMaxWidth(req)
            })
    })

router.route('/privacy-policy')
    .get((req, res) => {
        res.render(
            'privacy-policy',
            {
                html_title: 'Privacy Policy',
                user: req.session.user,
                max_width: getCurrSiteMaxWidth(req)
            })
    })

router.route('/contact-us')
    .get((req, res) => {
        res.render(
            'contact-us',
            {
                html_title: 'Contact Us',
                user: req.session.user,
                max_width: getCurrSiteMaxWidth(req)
            })
    })

router.route('/api')
    .get((req, res) => {
        res.render(
            'api',
            {
                html_title: 'API',
                user: req.session.user,
                max_width: getCurrSiteMaxWidth(req)
            })
    })

router.get(
    '/sign-up',
    (req, res) => {
        if(req.session.user) {
            res.render(
                'message',
                {
                    html_title: htmlTitleSignUp,
                    message: "You already signed up." +
                        " If you want to create another account then please log out.",
                    user: req.session.user,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            res.render(
                'sign-up',
                {
                    html_title: htmlTitleSignUp,
                    errors:[],
                    username: "",
                    is_login: "yes",
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
    }
)

router.post(
    '/sign-up',
    body('username', 'Username must be 4-16 characters(letters, numbers and dashes only)')
        .notEmpty().withMessage('Please fill in a username')
        .matches(regexUsername),
    body('password', 'Password must be 9-100 characters')
        .notEmpty().withMessage('Please fill in a password')
        .matches(/^.{9,100}$/),
    async (req, res) => {
        let errors = validationResult(req).array({onlyFirstError:true})

        if(errors.length) {
            res.render(
                'sign-up',
                {
                    html_title: htmlTitleSignUp,
                    errors:errors,
                    username: req.body.username,
                    is_login: req.body.is_login,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            const {username, password} = req.body

            try {
                var {rows} = await db.createUser(username, password)
            }
            catch(err) {
                let errorMessage = (err.constraint == 'username_unique_idx')
                    ? `"${username}" already taken`
                    : 'unknown error, please try again'
                
                //
                return res.render(
                    'sign-up',
                    {
                        html_title: htmlTitleSignUp,
                        errors:[{msg:errorMessage}],
                        username: req.body.username,
                        is_login: req.body.is_login,
                        max_width: getCurrSiteMaxWidth(req)
                    })
            }

            if(req.body.is_login === 'yes') {
                req.session.user = {
                    user_id: rows[0].user_id,
                    username: rows[0].username,
                    time_zone: rows[0].time_zone,
                    post_mode: rows[0].post_mode,
                    comment_reply_mode: rows[0].comment_reply_mode,
                    site_width: rows[0].site_width,
                    eyes: rows[0].eyes
                }

                return res.redirect('/')
            }
            else {
                res.render(
                    'message',
                    {
                        html_title: htmlTitleSignUp,
                        message: "Sign up was successful, you can now log in.",
                        user: req.session.user,
                        max_width: getCurrSiteMaxWidth(req)
                    })
            }
        }
    }
)

router.get(
    '/login',
    (req, res) => {
        if(req.session.user) {
            res.render(
                'message',
                {
                    html_title: htmlTitleLogin,
                    message: "You're already logged in." +
                        " If you want to log in with a different account then please log out.",
                    user: req.session.user,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            res.render(
                'login',
                {
                    html_title: htmlTitleLogin,
                    errors:[],
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
    }
)

router.post(
    '/login',
    async (req, res) => {
        let errors = []
        const {rows} = await db.getUserWithUsername(req.body.username)

        if(rows.length) {
            try {
                if(await argon2.verify(rows[0].password, req.body.password)) {
                    req.session.user = {
                        user_id: rows[0].user_id,
                        username: rows[0].username,
                        time_zone: rows[0].time_zone,
                        post_mode: rows[0].post_mode,
                        comment_reply_mode: rows[0].comment_reply_mode,
                        site_width: rows[0].site_width,
                        eyes: rows[0].eyes
                    }

                    return res.redirect('/')
                }
                else {
                    errors.push('Invalid username and password')
                }
            }
            catch(err) {
                errors.push('Unknown error, please try it again')
            }
        }
        else {
            errors.push('Invalid username and password')
        }

        res.render(
            'login',
            {
                html_title: htmlTitleLogin,
                errors:errors,
                max_width: getCurrSiteMaxWidth(req)
            })
    }
)

router.route('/settings')
    .get(async (req, res) => {

        //
        const isViewMode = typeof req.query.viewmode !== 'undefined'

        if(isViewMode) {
            let viewMode = req.query.viewmode == 'discover'
                ? req.query.viewmode
                : 'following-only'

            //
            if(req.session.user) {
                await db.updateUserViewMode(
                    req.session.user.user_id,
                    viewMode)

                req.session.user.post_mode = viewMode
            }
            else {
                res.cookie(
                    'post_mode',
                    viewMode,
                    {maxAge: cookieMaxAge})
            }

            //
            const redirectUrl = (typeof req.query.goto === 'undefined')
                ? '/settings'
                : req.query.goto;

            return res.redirect(redirectUrl)
        }

        //
        const {rows} = await db.getTimeZones()
        const {rows:avaEyes} = await db.getAvailableEyes()
        const currEyes = await getCurrEyes(req)

        res.render(
            'my-settings',
            {
                html_title: htmlTitleSettings,
                errors: [],
                user: req.session.user,
                time_zones: rows,
                time_zone: myMisc.getCurrTimeZone(req),
                avaEyes: avaEyes,
                currEyes: currEyes,
                postMode: getCurrPostMode(req),
                commentReplyMode: getCurrCommentReplyMode(req),
                siteWidth: getCurrSiteMaxWidth(req),
                max_width: getCurrSiteMaxWidth(req)
            })
    })
    .post(async (req, res) => {
        
        //
        const {rows} = await db.getTimeZoneWithName(req.body.time_zone)

        //
        let eyesOkay = true
        let eyesValue = null

        //
        if(req.body.eyes !== "") {
            const {rows:eyesLookup} = await db.getUserWithUsername(req.body.eyes)

            if(eyesLookup.length && eyesLookup[0].is_eyes) {
                eyesValue = eyesLookup[0].user_id
            }
            else {
                eyesOkay = false
            }
        }

        //
        let errors = []

        if(!rows.length) {
            errors.push({msg: 'unknown time zone, pick again'})
        }

        if(!eyesOkay) {
            errors.push({msg: 'bad following list'})
        }

        const siteWidthInt = parseInt(req.body.site_width)
        const wisNaN = isNaN(siteWidthInt)
        const widthOkay = (req.body.site_width === '') ||
            (!wisNaN && siteWidthInt >= 500 && siteWidthInt <= 1000)

        if(!widthOkay) {
            errors.push({msg: 'site width must be between 500-1000, or left blank'})
        }

        //
        const {rows:rows2} = await db.getTimeZones()
        const {rows:avaEyes} = await db.getAvailableEyes()
        const currEyes = req.body.eyes

        //
        if(errors.length) {
            res.render(
                'my-settings',
                {
                    html_title: htmlTitleSettings,
                    errors: errors,
                    user: req.session.user,
                    time_zones: rows2,
                    time_zone: req.body.time_zone,
                    avaEyes: avaEyes,
                    currEyes: currEyes,
                    postMode: req.body.post_mode,
                    commentReplyMode: req.body.comment_reply_mode,
                    siteWidth: req.body.site_width,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            if(req.session.user) {
                await db.updateUser(
                    req.session.user.user_id,
                    req.body.time_zone,
                    req.body.post_mode,
                    req.body.comment_reply_mode,
                    req.body.site_width,
                    eyesValue)

                req.session.user.time_zone = req.body.time_zone
                req.session.user.post_mode = req.body.post_mode
                req.session.user.comment_reply_mode = req.body.comment_reply_mode
                req.session.user.site_width = (req.body.site_width === '')
                    ? null
                    : parseInt(req.body.site_width);
                
                req.session.user.eyes = eyesValue
            }
            else {
                res.cookie(
                    'time_zone',
                    req.body.time_zone,
                    {maxAge: cookieMaxAge})

                res.cookie(
                    'eyes',
                    req.body.eyes,
                    {maxAge: cookieMaxAge})

                res.cookie(
                    'post_mode',
                    req.body.post_mode,
                    {maxAge: cookieMaxAge})

                res.cookie(
                    'comment_mode',
                    req.body.comment_mode,
                    {maxAge: cookieMaxAge})

                res.cookie(
                    'site_width',
                    req.body.site_width,
                    {maxAge: cookieMaxAge})
            }

            res.render(
                'my-settings',
                {
                    html_title: htmlTitleSettings,
                    errors: [{msg: 'Settings successfully saved.'}],
                    user: req.session.user,
                    time_zones: rows2,
                    time_zone: req.body.time_zone,
                    avaEyes: avaEyes,
                    currEyes: currEyes,
                    postMode: req.body.post_mode,
                    commentReplyMode: req.body.comment_reply_mode,
                    siteWidth: req.body.site_width,
                    max_width: req.body.site_width === '' ? null : parseInt(req.body.site_width)
                })
        }
    })

router.get(
    '/logout',
    (req, res) => {
        req.session.destroy()
        res.redirect('/')
    }
)

//single tag: posts
router.get(
    /^\/r\/([a-z0-9-]{3,20})$/,
    async (req, res) => {
        const tag = req.params[0]
        let finalUserId = req.session.user ? req.session.user.user_id : -1

        //
        let page = 1

        if(typeof req.query.p !== 'undefined') {
            page = parseInt(req.query.p)

            if(isNaN(page)) {
                return res.redirect(`/${tag}`)
            }
        }

        //
        const isDiscoverMode = isDiscover(req)
        const filterUserId = await getCurrEyesId(req)

        //
        const {rows} = await db.getTagPosts(
            finalUserId,
            myMisc.getCurrTimeZone(req),
            page,
            tag,
            isDiscoverMode,
            filterUserId)

        res.render(
            'posts2',
            {
                html_title: tag,
                user: req.session.user,
                posts: rows,
                page: page,
                base_url: `/r/${tag}`,
                is_discover_mode: isDiscoverMode,
                max_width: getCurrSiteMaxWidth(req)
            })
    }
)

//new post
router.route('/new')
    .get(async (req, res) => {
        if(req.session.user) {
            res.render(
                'new-post2',
                {
                    html_title: htmlTitleNewPost,
                    user: req.session.user,
                    errors: [],
                    title: "",
                    link: "",
                    textContent: "",
                    tags: "",
                    submitLabel: 'Create Post',
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            res.render(
                'message',
                {
                    html_title: htmlTitleNewPost,
                    message: "Please <a href=\"/login\">log in</a> to create a post.",
                    user: req.session.user,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
    })
    .post(
        (req, res, next) => {

            //remove if blank so it doesn't trigger the validator
            if(req.body.link === '') {
                req.body.link = undefined
            }
    
            next()
        },
        body('text_content', 'Please write some content').optional(),
        body('link', 'link must be a URL to a website').optional().isURL(),
        async (req, res) => {
            if(req.session.user) {
                let errors = validationResult(req).array({onlyFirstError:true})

                //
                let [wsCompressedTitle, error] = processPostTitle(req.body.title)

                if(error !== null) {
                    errors.push(error)
                }

                //
                let [trimTags, tagErrors] = processPostTags(req.body.tags)
                errors = errors.concat(tagErrors)

                //
                if(errors.length) {
                    res.render(
                        'new-post2',
                        {
                            html_title: htmlTitleNewPost,
                            user: req.session.user,
                            errors: errors,
                            title: req.body.title,
                            link: (typeof req.body.link !== 'undefined' ? req.body.link : ''),
                            textContent: req.body.text_content,
                            tags: req.body.tags,
                            submitLabel: 'Create Post',
                            max_width: getCurrSiteMaxWidth(req)
                        })
                }
                else {
                    let vals = db.createPost(
                        req.session.user.user_id,
                        wsCompressedTitle,
                        req.body.text_content,
                        req.body.link)
    
                    const {rows} = await vals[0]

                    //
                    await createPostTags(trimTags, rows[0].post_id)
                    
                    //
                    return res.redirect('/p/' + vals[1])
                }
            }
            else {
                res.send('nope...')
            }
        }
    )

//edit post
router.route(/^\/p\/([a-z0-9]{22})\/edit$/i)
    .get(async (req, res) => {
        if(req.session.user) {

            //
            const postPublicId = req.params[0]
            const {rows} = await db.getPostWithPublic(postPublicId)

            //
            if(!rows.length) {
                return res.send('unknown post...')
            }

            //
            if(rows[0].user_id != req.session.user.user_id) {
                return res.send('wrong user...')
            }

            //
            res.render(
                'new-post2',
                {
                    html_title: htmlTitleEditPost,
                    user: req.session.user,
                    errors: [],
                    title: rows[0].title,
                    link: rows[0].link === null ? '' : rows[0].link,
                    textContent: rows[0].text_content,
                    tags: rows[0].tags.join(', '),
                    submitLabel: 'Edit Post',
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            res.send('sorry...')
        }
    })
    .post(
        (req, res, next) => {

            //remove if blank so it doesn't trigger the validator
            if(req.body.link === '') {
                req.body.link = undefined
            }
    
            next()
        },
        body('text_content', 'Please write some content').optional(),
        body('link', 'link must be a URL to a website').optional().isURL(),
        async (req, res) => {
            if(req.session.user) {

                //
                const postPublicId = req.params[0]
                const {rows} = await db.getPostWithPublic(postPublicId)

                //
                if(!rows.length) {
                    return res.send('unknown post...')
                }

                //
                if(rows[0].user_id != req.session.user.user_id) {
                    return res.send('wrong user...')
                }

                let errors = validationResult(req).array({onlyFirstError:true})

                //
                let [wsCompressedTitle, error] = processPostTitle(req.body.title)

                if(error !== null) {
                    errors.push(error)
                }

                //
                let [trimTags, tagErrors] = processPostTags(req.body.tags)
                errors = errors.concat(tagErrors)

                //
                if(errors.length) {
                    res.render(
                        'new-post2',
                        {
                            html_title: htmlTitleEditPost,
                            user: req.session.user,
                            errors: errors,
                            title: req.body.title,
                            link: (typeof req.body.link !== 'undefined' ? req.body.link : ''),
                            textContent: req.body.text_content,
                            tags: req.body.tags,
                            submitLabel: 'Edit Post',
                            max_width: getCurrSiteMaxWidth(req)
                        })
                }
                else {
                    await db.updatePost(
                        rows[0].post_id,
                        wsCompressedTitle,
                        req.body.text_content,
                        req.body.link)

                    // delete tags for this post
                    await db.deletePostTags(rows[0].post_id)

                    //
                    await createPostTags(trimTags, rows[0].post_id)
                    
                    //
                    return res.redirect('/p/' + postPublicId)
                }
            }
            else {
                res.send('nope...')
            }
        }
    )

//edit comment
router.route(/^\/c\/([a-z0-9]{22})\/edit$/i)
    .get(async (req, res) => {
        if(req.session.user) {

            //
            const commentPublicId = req.params[0]
            const {rows} = await db.getCommentWithPublic(commentPublicId)

            //
            if(!rows.length) {
                return res.send('unknown comment...')
            }

            //
            if(rows[0].user_id != req.session.user.user_id) {
                return res.send('wrong user...')
            }

            //
            res.render(
                'edit-comment',
                {
                    html_title: htmlTitleEditComment,
                    user: req.session.user,
                    errors: [],
                    textContent: rows[0].text_content,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
        else {
            res.send('sorry...')
        }
    })
    .post(async (req, res) => {
            if(req.session.user) {

                //
                const commentPublicId = req.params[0]
                const {rows} = await db.getCommentWithPublic(commentPublicId)

                //
                if(!rows.length) {
                    return res.send('unknown comment...')
                }

                //
                if(rows[0].user_id != req.session.user.user_id) {
                    return res.send('wrong user...')
                }

                //
                let [compressedComment, errors] = processComment(req.body.text_content)

                //
                if(errors.length) {
                    res.render(
                        'edit-comment',
                        {
                            html_title: htmlTitleEditComment,
                            user: req.session.user,
                            errors: errors,
                            textContent: "",
                            max_width: getCurrSiteMaxWidth(req)
                        })
                }
                else {
                    await db.updateComment(
                        rows[0].comment_id,
                        compressedComment)
                    
                    //
                    return res.redirect('/c/' + commentPublicId)
                }
            }
            else {
                res.send('nope...')
            }
        }
    )

//
function processPostTitle(rTitle) {
    let titleNoWhitespace = rTitle.replace(/\s/g, '')
    let numNonWsChars = titleNoWhitespace.length
    let wsCompressedTitle = rTitle.replace(/\s+/g, ' ').trim()
    let error = null

    if(rTitle.length === 0) {
        error = {'msg': 'Please fill in a title'}
    }
    else if(numNonWsChars < 4) {
        error = {'msg': 'Title must be at least 4 characters'}
    }
    else if(wsCompressedTitle.length > 160) {
        error = {'msg': 'Title can\'t be more than 160 characters'}
    }

    //
    return [wsCompressedTitle, error]
}

//
function processPostTags(rTags) {
    let tags = rTags.split(',')
    let trimTags = []
    let errors = []

    for(let i = 0; i < tags.length; ++i) {
        let trimTag = tags[i].trim().toLowerCase()

        if(trimTag !== "" && trimTags.indexOf(trimTag) == -1) {
            trimTags.push(trimTag)
        }
    }

    //
    let isCharError = false
    let isLenError = false

    for(let i = 0; i < trimTags.length; ++i) {
        let isMatch = trimTags[i].match(/^[0-9a-zA-Z-]+$/)

        if(!isCharError && isMatch === null) {
            errors.push({'msg': 'group names can only contain numbers, letters and dashes'})
            isCharError = true
        }

        let tagLen = trimTags[i].length
        let isLenOkay = tagLen >= 3 && tagLen <= 20

        if(!isLenError && !isLenOkay) {
            errors.push({'msg': 'each group name must be 3-20 characters'})
            isLenError = true
        }
    }

    //
    if(trimTags.length > 4) {
        errors.push({'msg': 'the max tags per post is 4'})
    }

    //
    return [trimTags, errors]
}

//
async function createPostTags(trimTags, postId) {
    let tagIds = []

    for(let i = 0; i < trimTags.length; ++i) {
        const {rows:tagd} = await db.getTag(trimTags[i])

        if(tagd.length) {
            tagIds.push(tagd[0].tag_id)
        }
        else {
            const {rows:tagInsert} = await db.createTag(trimTags[i])
            tagIds.push(tagInsert[0].tag_id)
        }
    }

    //
    for(let i = 0; i < tagIds.length; ++i) {
        await db.createPostTag(tagIds[i], postId)
    }
}

//single post
router.route(/^\/p\/([a-z0-9]{22})$/i)
    .get(async (req, res) => {
        const postPublicId = req.params[0]
        const finalUserId = req.session.user ? req.session.user.user_id : -1
        const filterUserId = await getCurrEyesId(req)

        const {rows} = await db.getPostWithPublic2(
            postPublicId,
            myMisc.getCurrTimeZone(req),
            finalUserId,
            filterUserId)

        if(rows.length) {

            //
            const isDiscoverMode = isDiscover(req)

            const{rows:comments} = await db.getPostComments(
                rows[0].post_id,
                myMisc.getCurrTimeZone(req),
                finalUserId,
                isDiscoverMode,
                filterUserId)

            res.render(
                'single-post',
                {
                    html_title: rows[0].title,
                    user: req.session.user,
                    post: rows[0],
                    comments: comments,
                    errors: [],
                    is_discover_mode: isDiscoverMode,
                    comment_reply_mode: getCurrCommentReplyMode(req),
                    max_width: getCurrSiteMaxWidth(req)
                }
            )
        }
        else {
            res.send('not found')
        }
    })
    .post(
        async (req, res) => {

            if(req.session.user) {
                const postPublicId = req.params[0]
                const finalUserId = req.session.user ? req.session.user.user_id : -1
                const filterUserId = await getCurrEyesId(req)

                const {rows} = await db.getPostWithPublic2(
                    postPublicId,
                    myMisc.getCurrTimeZone(req),
                    finalUserId,
                    filterUserId)

                if(rows.length) {
                    let [compressedComment, errors] = processComment(req.body.text_content)

                    //
                    if(errors.length) {

                        //
                        const isDiscoverMode = isDiscover(req)

                        const{rows:comments} = await db.getPostComments(
                            rows[0].post_id,
                            myMisc.getCurrTimeZone(req),
                            finalUserId,
                            isDiscoverMode,
                            filterUserId)

                        res.render(
                            'single-post',
                            {
                                html_title: rows[0].title,
                                user: req.session.user,
                                post: rows[0],
                                comments: comments,
                                errors: errors,
                                is_discover_mode: isDiscoverMode,
                                comment_reply_mode: getCurrCommentReplyMode(req),
                                max_width: getCurrSiteMaxWidth(req)
                            }
                        )
                    }
                    else {

                        //
                        const {rows:data1} = await db.createPostComment(
                            rows[0].post_id,
                            req.session.user.user_id,
                            compressedComment)

                        //
                        await db.incPostNumComments(rows[0].post_id)
                        return res.redirect(`/p/${postPublicId}#${data1[0].public_id}`)
                    }
                }
                else {
                    res.send('not found')
                }
            }
            else {
                res.send('nope...')
            }
        })

//single comment
router.route(/^\/c\/([a-z0-9]{22})$/i)
    .get(async (req, res) => {
        const commentPublicId = req.params[0]
        const finalUserId = req.session.user ? req.session.user.user_id : -1
        const filterUserId = await getCurrEyesId(req)

        const {rows} = await db.getCommentWithPublic2(
            commentPublicId,
            myMisc.getCurrTimeZone(req),
            finalUserId,
            filterUserId)

        if(rows.length) {

            //
            const isDiscoverMode = isDiscover(req)

            const{rows:comments} = await db.getCommentComments(
                rows[0].path,
                myMisc.getCurrTimeZone(req),
                finalUserId,
                isDiscoverMode,
                filterUserId)

            res.render(
                'single-comment',
                {
                    html_title: htmlTitleComment + commentPublicId,
                    user: req.session.user,
                    post_public_id: rows[0].post_public_id,
                    comment: rows[0],
                    comments: comments,
                    errors: [],
                    is_discover_mode: isDiscoverMode,
                    comment_reply_mode: getCurrCommentReplyMode(req),
                    max_width: getCurrSiteMaxWidth(req)
                }
            )
        }
        else {
            res.send('not found..')
        }
    })
    .post(
        async (req, res) => {
            if(req.session.user) {
                const commentPublicId = req.params[0]
                const finalUserId = req.session.user ? req.session.user.user_id : -1
                const filterUserId = await getCurrEyesId(req)

                const {rows} = await db.getCommentWithPublic2(
                    commentPublicId,
                    myMisc.getCurrTimeZone(req),
                    finalUserId,
                    filterUserId)

                if(rows.length) {
                    let [compressedComment, errors] = processComment(req.body.text_content)

                    if(errors.length) {

                        //
                        const isDiscoverMode = isDiscover(req)

                        const{rows:comments} = await db.getCommentComments(
                            rows[0].path,
                            myMisc.getCurrTimeZone(req),
                            finalUserId,
                            isDiscoverMode,
                            filterUserId)

                        res.render(
                            'single-comment',
                            {
                                html_title: htmlTitleComment + commentPublicId,
                                user: req.session.user,
                                post_public_id: rows[0].post_public_id,
                                comment: rows[0],
                                comments: comments,
                                errors: errors,
                                is_discover_mode: isDiscoverMode,
                                comment_reply_mode: getCurrCommentReplyMode(req),
                                max_width: getCurrSiteMaxWidth(req)
                            }
                        )
                    }
                    else {

                        //
                        const {rows:data1} = await db.createCommentComment(
                            rows[0].post_id,
                            req.session.user.user_id,
                            compressedComment,
                            rows[0].path,
                            'UTC')

                        //
                        await db.incPostNumComments(rows[0].post_id)
                        return res.redirect(`/c/${commentPublicId}#${data1[0].public_id}`)
                    }
                }
                else {
                    res.send('not found')
                }
            }
            else {
                res.send('nope...')
            }
    })

//todo: dry this up
function processComment(rawText) {
    let noWhitespace = rawText.replace(/\s/g, '')
    let numNonWsChars = noWhitespace.length
    let compressedText = rawText.trim()
    let errors = []

    if(rawText.length === 0) {
        errors.push({'msg': 'Please fill in a comment'})
    }
    else if(numNonWsChars < 1) {
        errors.push({'msg': 'Comment must be at least 1 character'})
    }

    //
    return [compressedText, errors]
}

//
router.route('/inbox')
    .get(async (req, res) => {
        if(req.session.user) {

            //
            const filterUserId = await getCurrEyesId(req)
            const isDiscoverMode = isDiscover(req)

            //
            let page = 1

            if(typeof req.query.p !== 'undefined') {
                page = parseInt(req.query.p)

                if(isNaN(page)) {
                    return res.redirect('/inbox')
                }
            }

            //
            const{rows:comments} = await db.getInboxComments(
                myMisc.getCurrTimeZone(req),
                req.session.user.user_id,
                isDiscoverMode,
                filterUserId,
                page)

            //
            res.render(
                'inbox',
                {
                    html_title: 'Inbox',
                    user: req.session.user,
                    comments: comments,
                    page: page,
                    is_discover_mode: isDiscoverMode,
                    comment_reply_mode: getCurrCommentReplyMode(req),
                    max_width: getCurrSiteMaxWidth(req)
                }
            )
        }
        else {
            res.render(
                'message',
                {
                    html_title: 'Inbox',
                    message: "<a href=\"/login\">Log in</a> to view your inbox.",
                    user: req.session.user,
                    max_width: getCurrSiteMaxWidth(req)
                })
        }
    })

//
router.route('/following')
    .get(async (req, res) => {

        //
        const isFollow = typeof req.query.follow !== 'undefined'
        const isFollowed = typeof req.query.followed !== 'undefined'
        const isUnfollow = typeof req.query.unfollow !== 'undefined'
        const isUnfollowed = typeof req.query.unfollowed !== 'undefined'

        if(req.session.user) {

            if(isUnfollow) {
                let username = req.query.unfollow
                const {rows} = await db.getUserWithUsername(username)

                if(rows.length) {

                    //
                    const {rows:rows2} = await db.getUserFollowee(
                        req.session.user.user_id,
                        rows[0].user_id
                    )

                    //
                    if(rows2.length) {
                        await db.removeFollower(
                            req.session.user.user_id,
                            rows[0].user_id
                        )

                        const redirectUrl = (typeof req.query.goto === 'undefined')
                                ? `/following?unfollowed=${username}`
                                : req.query.goto;

                        return res.redirect(redirectUrl)
                    }
                    else {
                        renderFollowing(req, res,
                            [{msg: 'You are not following that user'}],
                            '')
                    }
                }
                else {
                    renderFollowing(req, res,
                        [{msg: 'No such user'}],
                        '')
                }
            }
            else if(isFollow) {
                let username = req.query.follow
                const {rows} = await db.getUserWithUsername(username)

                if(rows.length) {
                    if(req.session.user.user_id == rows[0].user_id) {
                        renderFollowing(req, res,
                            [{msg: 'You don\'t need to follow yourself'}],
                            username)
                    }
                    else {
                        //
                        const {rows:rows2} = await db.getUserFollowee(
                            req.session.user.user_id,
                            rows[0].user_id
                        )

                        //
                        if(rows2.length) {
                            renderFollowing(req, res,
                                [{msg: 'You are already following that user'}],
                                username)
                        }
                        else {
                            await db.addFollower(
                                req.session.user.user_id,
                                rows[0].user_id
                            )

                            const redirectUrl = (typeof req.query.goto === 'undefined')
                                ? `/following?followed=${username}`
                                : req.query.goto;

                            return res.redirect(redirectUrl)
                        }
                    }
                }
                else {
                    renderFollowing(req, res,
                        [{msg: 'No such user'}],
                        username)
                }
            }
            else if(isFollowed) {

                //TODO: should probably check if
                //username exists and is followed by
                //logged in user

                renderFollowing(req, res,
                    [{msg: `You followed ${req.query.followed}`}],
                    '')
            }
            else if(isUnfollowed) {

                //TODO: should probably check if
                //username exists and is not followed by
                //logged in user

                renderFollowing(req, res,
                    [{msg: `You unfollowed ${req.query.unfollowed}`}],
                    '')
            }
            else {
                renderFollowing(req, res, [], '')
            }
        }
        else {
            res.redirect('/sign-up')
        }
    })
    .post(async (req, res) => {
        if(req.session.user) {

            //
            let errors = []

            if(req.body.username === '') {
                errors.push({msg: 'Please fill in a username'})
            }

            //
            if(errors.length) {
                renderFollowing(req, res, errors, req.body.username)
            }
            else {
                const {rows} = await db.getUserWithUsername(req.body.username)

                if(rows.length) {

                    if(req.session.user.user_id == rows[0].user_id) {
                        renderFollowing(req, res,
                            [{msg: 'You don\'t need to follow yourself'}],
                            req.body.username)
                    }
                    else {
                        //
                        const {rows:rows2} = await db.getUserFollowee(
                            req.session.user.user_id,
                            rows[0].user_id
                        )

                        //
                        if(rows2.length) {
                            renderFollowing(req, res,
                                [{msg: 'You are already following that user'}],
                                req.body.username)
                        }
                        else {
                            await db.addFollower(
                                req.session.user.user_id,
                                rows[0].user_id
                            )

                            return res.redirect('/following')
                        }
                    }
                }
                else {
                    renderFollowing(req, res, [{msg: 'No such user'}], req.body.username)
                }
            }
        }
        else {
            res.send('permission denied...')
        }
    })

//
async function renderFollowing(req, res, errors, formUsername) {
    const {rows} = await db.getUserFollowees(req.session.user.user_id)

    //
    res.render(
        'following',
        {
            html_title: 'Following',
            errors: errors,
            user: req.session.user,
            followees: rows,
            formUsername: formUsername,
            max_width: getCurrSiteMaxWidth(req)
        }
    )
}

module.exports = router

//
function getCurrPostMode(req) {
    if(req.session.user) {
        return (typeof req.session.user.post_mode === 'undefined')
            ? 'discover'
            : req.session.user.post_mode
    }
    else {
        return (typeof req.cookies.post_mode === 'undefined')
            ? 'following-only'
            : req.cookies.post_mode
    }
}

//
function getCurrCommentReplyMode(req) {
    const defaultValue = 'quick'

    if(req.session.user) {
        return (typeof req.session.user.comment_reply_mode === 'undefined')
            ? defaultValue
            : req.session.user.comment_reply_mode
    }
    else {
        return defaultValue
    }
}

//
function getCurrSiteMaxWidth(req) {
    const defaultValue = 600

    if(req.session.user) {
        return (typeof req.session.user.site_width === 'undefined')
            ? defaultValue
            : req.session.user.site_width
    }
    else {
        if(typeof req.cookies.site_width === 'undefined') {
            return defaultValue
        }
        else if(req.cookies.site_width === '') {
            return null
        }
        else {
            const siteWidthInt = parseInt(req.cookies.site_width)

            if(isNaN(siteWidthInt)) {
                return defaultValue
            }
            else if(siteWidthInt < 500 || siteWidthInt > 1000) {
                return defaultValue
            }
            else {
                return siteWidthInt
            }
        }
    }
}

//
function isDiscover(req) {
    return getCurrPostMode(req) !== 'discover'
        ? 0
        : 1
}

//
async function getCurrEyes(req) {
    let eyes = ''

    if(req.session.user && req.session.user.eyes) {
        const {rows} = await db.getUserWithUserId(req.session.user.eyes)
        eyes = rows[0].username
    }
    else if(!req.session.user) {
        eyes = typeof req.cookies.eyes !== 'undefined'
            ? req.cookies.eyes
            : eyesDefaultUsername
    }

    return eyes
}

//
async function getCurrEyesId(req) {
    if(req.session.user) {
        return req.session.user.eyes
            ? req.session.user.eyes
            : req.session.user.user_id
    }
    else {
        let username = eyesDefaultUsername

        if(typeof req.cookies.eyes !== 'undefined') {
            if(req.cookies.eyes === '') {
                return -1
            }
            else {
                username = req.cookies.eyes
            }
        }

        //
        const {rows} = await db.getUserWithUsername(username)

        if(rows.length && rows[0].is_eyes) {
            return rows[0].user_id
        }
        else {
            return -1
        }
    }
}
