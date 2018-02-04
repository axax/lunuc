import React from 'react'
import GenericForm from 'client/components/generic/GenericForm'
import genericComposer from './generic/genericComposer'
import {Link} from 'react-router-dom'
import BaseLayout from 'client/components/layout/BaseLayout'
import PropTypes from 'prop-types'
import {SimpleTable, SimpleDialog, DeleteIconButton, Typography, Switch} from 'ui/admin'
import Util from 'client/util'
import {ADMIN_BASE_URL} from 'gen/config'

const CMS_PAGES_PER_PAGE = 10


class CmsContainer extends React.Component {

    state = {
        rowsPerPage: CMS_PAGES_PER_PAGE,
        confirmDeletionDialog: false,
        dataToBeDeleted: null
    }

    render() {
        const {cmsPages} = this.props
        if (!cmsPages)
            return <BaseLayout />

        const startTime = new Date()
        const columns = [
                {
                    title: 'Slug',
                    id: 'slug'
                },
                {
                    title: 'Public',
                    id: 'public'
                },
                {
                    title: 'User',
                    id: 'user'
                },
                {
                    title: 'Created at',
                    id: 'date'
                },
                {
                    title: 'Actions',
                    id: 'action'
                }],
            dataSource = cmsPages.results && cmsPages.results.map((cmsPage) => ({
                    slug: <span onBlur={(e) => this.handleCmsPageChange.bind(this)(e, cmsPage, 'slug')}
                                suppressContentEditableWarning contentEditable>{cmsPage.slug}</span>,
                    public: <Switch name="public" value="on"
                                    onChange={(e) => this.handleCmsPageChange.bind(this)(e, cmsPage, 'public')}
                                    checked={cmsPage.public || false}/>,
                    user: cmsPage.createdBy.username,
                    date: Util.formattedDateFromObjectId(cmsPage._id),
                    action: <div>
                        <Link
                            to={'/' + cmsPage.slug}> View</Link>

                        <DeleteIconButton disabled={(cmsPage.status == 'deleting' || cmsPage.status == 'updating')}
                                          onClick={this.handleDeleteCmsPageClick.bind(this, cmsPage)}>Delete</DeleteIconButton>
                    </div>
                }))


        const totalPages = Math.ceil(cmsPages.total / CMS_PAGES_PER_PAGE),
            currentPage = Math.ceil(cmsPages.offset / CMS_PAGES_PER_PAGE) + 1
        const content =
            <BaseLayout>
                <Typography type="display2" gutterBottom>Content management</Typography>
                <GenericForm fields={{slug: {value: '', placeholder: 'slug name'}}}
                             onClick={this.handleAddCmsPageClick}/>


                <SimpleTable dataSource={dataSource} columns={columns} count={totalPages}
                             rowsPerPage={this.state.rowsPerPage} page={currentPage}
                             onChangePage={this.handleChangePage.bind(this)}
                             onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>

                {this.state.dataToDelete &&
                <SimpleDialog open={this.state.confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                              actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                              title="Confirm deletion">
                    Are you sure you want to delete the page
                    <strong> {this.state.dataToDelete.slug}</strong>?
                </SimpleDialog>
                }
            </BaseLayout>


        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content

    }


    handleAddCmsPageClick = (data) => {
        const {createCmsPage} = this.props
        createCmsPage(data)
    }

    handleCmsPageChange = (event, data, key) => {
        let value

        if (event.target.type === 'checkbox') {
            value = event.target.checked
        } else {
            value = event.target.innerText.trim()
        }



        if (value !== data[key]) {
            const {updateCmsPage} = this.props
            updateCmsPage(
                Object.assign({}, data, {[key]: value})
            )
        }
    }

    handleDeleteCmsPageClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToDelete: data})
    }


    handleChangePage = (page) => {
        this.props.history.push(`${ADMIN_BASE_URL}/cms/${(page)}`)
    }


    handleChangeRowsPerPage = (rowsPerPage) => {
        this.setState({rowsPerPage})
        this.props.setOptionsForCmsPages({limit: rowsPerPage})
        this.props.refetchCmsPages()
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            const {deleteCmsPage} = this.props
            deleteCmsPage({
                _id: this.state.dataToDelete._id
            })
        }
        this.setState({confirmDeletionDialog: false, dataToDelete: false})
    }
}


CmsContainer.propTypes = {
    history: PropTypes.object.isRequired,
    cmsPages: PropTypes.object,
    createCmsPage: PropTypes.func.isRequired,
    updateCmsPage: PropTypes.func.isRequired,
    deleteCmsPage: PropTypes.func.isRequired,
    refetchCmsPages: PropTypes.func.isRequired,
    setOptionsForCmsPages: PropTypes.func.isRequired,
    loading: PropTypes.bool
}


export default genericComposer(CmsContainer, 'cmsPage', {
    fields: {'slug': 'String!', 'public': 'Boolean'},
    limit: CMS_PAGES_PER_PAGE
})

