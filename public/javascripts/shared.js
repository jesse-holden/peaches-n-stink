
//
var currCpid = null
var currForm = null

//
function reply(cpid) {

    // if open and same then remove and nothing else
    if(cpid == currCpid) {
        document.getElementById(currCpid).removeChild(currForm)
        currCpid = null
        currForm = null
        return
    }

    // if open and different then remove and then do the rest
    if(currCpid) {
        document.getElementById(currCpid).removeChild(currForm)
        currCpid = null
        currForm = null
    }

    //
    let commentLi = document.getElementById(cpid)
    let liChildren = commentLi.children
    let numLiChildren = liChildren.length
    let lastChild = liChildren[numLiChildren - 1]
    let isUl = lastChild.tagName == 'UL'

    //
    let cForm = document.createElement('div')
    currForm = cForm
    let cTextarea = document.createElement('textarea')
    let cButton = document.createElement('input')
    cButton.type = 'button'
    cButton.value = 'Send'
    cButton.onclick = function() {
        const comment = cTextarea.value.trim()

        if(comment != '') {
            const xhr = new XMLHttpRequest()

            xhr.open('POST', '/api/v1/comment')
            xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
            xhr.onload = function() {
                if(xhr.status == 200) {
                    
                    //
                    const data = JSON.parse(xhr.responseText)

                    //
                    const li = document.createElement('li')
                    li.id = data.public_id

                    const space1 = document.createTextNode(' ')
                    const space2 = document.createTextNode(' ')
                    const space3 = document.createTextNode(' ')

                    const bySpan = document.createElement('span')
                    bySpan.className = 'cuser'
                    bySpan.innerHTML = data.by

                    const dateSpan = document.createElement('span')
                    dateSpan.className = 'cdate'
                    dateSpan.innerText = 'on ' + data.created_on

                    const headerElem = document.createElement('div')
                    headerElem.appendChild(bySpan)
                    headerElem.appendChild(space1)
                    headerElem.appendChild(dateSpan)

                    const replyLink = document.createElement('a')
                    const replyLinkText = document.createTextNode('reply')
                    replyLink.appendChild(replyLinkText)
                    replyLink.href = "#"
                    replyLink.onclick = function() {
                        reply(data.public_id)
                        return false
                    }

                    const permalink = document.createElement('a')
                    const permalinkText = document.createTextNode('link')
                    permalink.appendChild(permalinkText)
                    permalink.href = "/c/" + data.public_id

                    const editLink = document.createElement('a')
                    const editLinkText = document.createTextNode('edit')
                    editLink.appendChild(editLinkText)
                    editLink.className = 'edit-link'
                    editLink.href = "/c/" + data.public_id + '/edit'

                    const footerElem = document.createElement('div')
                    footerElem.className = 'clinks'
                    footerElem.appendChild(permalink)
                    footerElem.appendChild(space2)
                    footerElem.appendChild(replyLink)
                    footerElem.appendChild(space3)
                    footerElem.appendChild(editLink)

                    const contentSpan = document.createElement('span')
                    contentSpan.innerHTML = data.text_content

                    //
                    li.appendChild(headerElem)
                    li.appendChild(contentSpan)
                    li.appendChild(footerElem)

                    //
                    if(isUl) {
                        //insert li as first elem of ul
                        lastChild.insertBefore(li, lastChild.children[0])
                    }
                    else {
                        const newUl = document.createElement('ul')
                        newUl.appendChild(li)
                        commentLi.appendChild(newUl)
                    }

                    //
                    commentLi.removeChild(cForm)
                    currCpid = null
                    currForm = null
                }
                else {
                    alert('error, please try later')
                }
            }

            xhr.send(encodeURI('commentid=' + cpid + '&text_content=' + comment))
        }
    }

    cForm.appendChild(cTextarea)
    cForm.appendChild(cButton)
    
    //
    if(isUl) {
        //console.log('ul exists, insert comment')
        commentLi.insertBefore(cForm, lastChild)
    }
    else {
        //console.log('ul doesnt exist, create ul...')
        commentLi.appendChild(cForm)
    }

    //
    currCpid = cpid
}
